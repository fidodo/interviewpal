import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { analyzeFillers, analyzeHedges } from "../services/transcriptAnalysis";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import {
  MAX_CONVERSATION_TURNS,
  MIN_CONVERSATION_TURNS,
  Turn,
  conversationMessages,
  conversationTranscript,
} from "./story.prompts";
import { aiProvider } from "../ai/provider.factory";
import { DeliveryStats, StoryGrade, StoryKind, VoiceStats, storyGradePrompt, storyGradeSchema, storySetupPrompt, storySetupSchema } from "./story.prompts";
import { DRILLS, DRILL_KINDS, DrillKind, isDrill, pickDrillPrompt } from "./story.drills";

// "Recent drills" on the Speak page.
const RECENT_DRILLS = 5;

export const MAX_TAKES = 5;
const RECENT = 10;
const STALE_GRADING_MS = 2 * 60 * 1000;

export async function createStory(userId: string, input: { kind: StoryKind; topic: string | null; audience: string | null; targetSeconds: number }) {
  const recent = await prisma.storyPractice.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: RECENT, select: { prompt: true } });
  const setup = await generateValidated(storySetupPrompt({ ...input, recentPrompts: recent.map((r) => r.prompt) }), storySetupSchema);
  return prisma.storyPractice.create({
    data: {
      userId,
      kind: input.kind,
      topic: input.topic,
      audience: setup.audience,
      targetSeconds: input.targetSeconds,
      prompt: setup.prompt,
      coachingNotes: JSON.stringify(setup.coachingNotes),
    },
  });
}

// A 1-minute drill: the prompt, audience and coaching notes come from story.drills.ts, so there's no AI call.
export async function createDrill(userId: string, kind: DrillKind) {
  const drill = DRILLS[kind];
  const recent = await prisma.storyPractice.findMany({ where: { userId, kind }, orderBy: { createdAt: "desc" }, take: RECENT, select: { prompt: true } });
  return prisma.storyPractice.create({
    data: {
      userId,
      kind,
      audience: drill.audience,
      targetSeconds: drill.targetSeconds,
      prompt: pickDrillPrompt(kind, recent.map((r) => r.prompt)),
      coachingNotes: JSON.stringify(drill.coachingNotes),
    },
    select: { id: true },
  });
}

export async function listStories(userId: string) {
  // Only the latest round of each story; earlier rounds are linked from the round page. Drills are listed apart (the
  // last few), so a run of drills never pushes stories off the list.
  const select = { id: true, kind: true, prompt: true, targetSeconds: true, round: true, createdAt: true, takes: { select: { score: true } }, bankEntry: { select: { id: true } } } as const;
  const drillKinds = [...DRILL_KINDS];
  const [stories, drills] = await Promise.all([
    prisma.storyPractice.findMany({ where: { userId, nextRound: { is: null }, kind: { notIn: drillKinds } }, orderBy: { createdAt: "desc" }, take: 30, select }),
    prisma.storyPractice.findMany({ where: { userId, kind: { in: drillKinds } }, orderBy: { createdAt: "desc" }, take: RECENT_DRILLS, select }),
  ]);
  return [...stories, ...drills].map(({ takes, bankEntry, ...s }) => ({
    ...s,
    banked: !!bankEntry,
    takes: takes.length,
    bestScore: takes.length ? Math.max(...takes.map((t) => t.score)) : null,
  }));
}

export function findStory(userId: string, id: string) {
  return prisma.storyPractice.findFirst({ where: { id, userId }, include: { takes: { orderBy: { number: "asc" } }, bankEntry: { select: { id: true } }, nextRound: { select: { id: true } } } });
}

// Every round of the same story (ids), following continuesFromId back and nextRound forward. Rounds are few.
export async function roundIds(id: string) {
  const ids = [id];
  for (let cur = id; ; ) {
    const s = await prisma.storyPractice.findUnique({ where: { id: cur }, select: { continuesFromId: true } });
    if (!s?.continuesFromId || ids.includes(s.continuesFromId)) break;
    ids.push((cur = s.continuesFromId));
  }
  for (let cur = id; ; ) {
    const next = await prisma.storyPractice.findUnique({ where: { continuesFromId: cur }, select: { id: true } });
    if (!next || ids.includes(next.id)) break;
    ids.push((cur = next.id));
  }
  return ids;
}

// The story bank entry saved from any round of this story, if there is one.
export async function bankEntryForRounds(id: string) {
  const ids = await roundIds(id);
  return prisma.storyBankEntry.findFirst({ where: { storyId: { in: ids } }, select: { id: true } });
}

export async function deleteStory(userId: string, id: string) {
  const deleted = await prisma.storyPractice.deleteMany({ where: { id, userId } });
  return deleted.count === 1;
}

// Typed takes (no recorded time) get a duration estimated at 150 words a minute, for the length check only.
function deliveryStats(transcript: string, recordedSec: number | null, voice: VoiceStats | null): DeliveryStats {
  const fillers = analyzeFillers(transcript);
  const durationSec = recordedSec ?? Math.max(1, Math.round((fillers.wordCount / 150) * 60));
  return {
    wordCount: fillers.wordCount,
    wpm: recordedSec ? Math.round(fillers.wordCount / (recordedSec / 60)) : null,
    durationSec,
    timed: recordedSec !== null,
    fillers: { count: fillers.count, words: fillers.words },
    hedges: analyzeHedges(transcript),
    // Only for a recorded take: a typed one has no voice to measure.
    voice: recordedSec !== null ? voice : null,
  };
}

// Grades a take and saves it. The story is claimed first (gradingAt), so a double submit is refused before a second
// AI call; a claim older than STALE_GRADING_MS can be retaken. The take is written only after grading succeeds, and
// @@unique([storyId, number]) backs up the claim.
export async function submitTake(
  userId: string,
  id: string,
  input: { transcript: string | null; turns: Turn[] | null },
  recordedSec: number | null,
  voice: VoiceStats | null = null
) {
  const story = await findStory(userId, id);
  if (!story) return null;
  if (story.takes.length >= MAX_TAKES) return "full" as const;
  // A conversation is marked as a whole: the transcript is built from its turns, and the delivery stats count only the
  // speaker's own lines. Anything else needs a transcript.
  let transcript: string;
  let ownWords: string;
  if (story.kind === "CONVERSATION") {
    const yours = input.turns?.filter((t) => t.role === "you") ?? [];
    if (yours.length < MIN_CONVERSATION_TURNS) return "turns" as const;
    transcript = conversationTranscript(story.prompt, input.turns!);
    ownWords = yours.map((t) => t.text).join("\n");
  } else {
    if (!input.transcript) return "transcript" as const;
    transcript = ownWords = input.transcript;
  }

  const claimedAt = new Date();
  const claimed = await prisma.storyPractice.updateMany({
    where: { id, OR: [{ gradingAt: null }, { gradingAt: { lt: new Date(Date.now() - STALE_GRADING_MS) } }] },
    data: { gradingAt: claimedAt },
  });
  if (claimed.count !== 1) return "busy" as const;

  try {
    // Re-read after the claim: another take may have been saved just before it.
    const takes = await prisma.storyTake.findMany({ where: { storyId: id }, orderBy: { number: "asc" } });
    if (takes.length >= MAX_TAKES) return "full" as const;
    // A new round's first take is compared with the last take of the round before it.
    const last =
      takes[takes.length - 1] ??
      (story.continuesFromId ? await prisma.storyTake.findFirst({ where: { storyId: story.continuesFromId }, orderBy: { number: "desc" } }) : null);
    const stats = deliveryStats(ownWords, recordedSec, voice);
    const grade: StoryGrade = await generateValidated(
      storyGradePrompt({
        kind: story.kind,
        prompt: story.prompt,
        audience: story.audience ?? "a general audience",
        coachingNotes: parseJsonArray<string>(story.coachingNotes),
        targetSeconds: story.targetSeconds,
        transcript,
        stats,
        previous: last
          ? {
              number: last.number,
              fromPreviousRound: takes.length === 0,
              breakdown: parseJsonObject<StoryGrade["breakdown"]>(last.breakdown)!,
              improvements: parseJsonObject<{ improvements: string[] }>(last.feedback)?.improvements ?? [],
            }
          : null,
      }),
      storyGradeSchema
    );
    await prisma.storyTake.create({
      data: {
        storyId: id,
        number: takes.length + 1,
        transcript,
        durationSec: stats.durationSec,
        stats: JSON.stringify(stats),
        score: grade.score,
        breakdown: JSON.stringify(grade.breakdown),
        feedback: JSON.stringify({
          strengths: grade.strengths,
          improvements: grade.improvements,
          cameAcross: grade.cameAcross,
          strongerVersion: grade.strongerVersion,
          outline: grade.outline,
          // Why each dimension got its score (takes marked before this was added have none).
          reasons: grade.reasons ?? null,
        }),
      },
    });
    return await findStory(userId, id);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "busy" as const;
    throw err;
  } finally {
    await prisma.storyPractice.updateMany({ where: { id, gradingAt: claimedAt }, data: { gradingAt: null } });
  }
}

// A conversation's next line from the other person (played by the AI). The turns live in the browser until the
// conversation is submitted, so the server stays stateless here. "over" once the speaker has had every turn.
export async function conversationReply(userId: string, id: string, turns: Turn[]) {
  const story = await prisma.storyPractice.findFirst({
    where: { id, userId },
    select: { kind: true, prompt: true, audience: true, topic: true, _count: { select: { takes: true } } },
  });
  if (!story || story.kind !== "CONVERSATION") return null;
  if (story._count.takes >= MAX_TAKES) return "full" as const;
  const yours = turns.filter((t) => t.role === "you").length;
  if (yours > MAX_CONVERSATION_TURNS) return "over" as const;
  const result = await aiProvider.chat(
    conversationMessages({
      audience: story.audience ?? "an interviewer",
      scenario: story.topic ?? "a job interview",
      opening: story.prompt,
      turns,
      turnsLeft: MAX_CONVERSATION_TURNS - yours + 1,
    }),
    { temperature: 0.7, maxTokens: 300 }
  );
  const reply = cleanReply(result.text);
  if (!reply) throw new Error("Empty conversation reply");
  // turnsLeft: how many more times the speaker can answer after this line.
  return { reply, turnsLeft: MAX_CONVERSATION_TURNS - yours };
}

// One spoken line: no speaker label or wrapping quotes, single spaces, at most 600 characters (cut at a sentence).
export function cleanReply(text: string) {
  let t = text.trim().replace(/^(them|interviewer|assistant)\s*:\s*/i, "").replace(/^["“](.*)["”]$/s, "$1").replace(/\s+/g, " ").trim();
  if (t.length > 600) {
    const cut = t.slice(0, 600);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    t = end > 200 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
  }
  return t;
}

// "Practise this story again": once every take is used, start the next round of the same story (same prompt,
// audience, length and coaching notes) with fresh takes. No AI call. continuesFromId is unique, so a double click
// returns the round that already exists instead of making a second one.
export async function practiseAgain(userId: string, id: string) {
  const story = await findStory(userId, id);
  if (!story) return null;
  if (story.nextRound) return { id: story.nextRound.id };
  // A drill doesn't get rounds: a new drill is a fresh prompt.
  if (isDrill(story.kind)) return "drill" as const;
  if (story.takes.length < MAX_TAKES) return "not-full" as const;
  try {
    const next = await prisma.storyPractice.create({
      data: {
        userId,
        kind: story.kind,
        topic: story.topic,
        audience: story.audience,
        targetSeconds: story.targetSeconds,
        prompt: story.prompt,
        coachingNotes: story.coachingNotes,
        round: story.round + 1,
        continuesFromId: story.id,
      },
      select: { id: true },
    });
    return next;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.storyPractice.findUnique({ where: { continuesFromId: story.id }, select: { id: true } });
      if (existing) return existing;
    }
    throw err;
  }
}

// Practice stories are temporary; the story bank is what's kept. Run daily by the cron (today.routes.ts).
// Never touches a story that's in the bank. Takes go with their story (cascade); streaks, badges and personal
// bests live in their own tables. 90 days is past the 12 weeks the progress page charts.
export const ABANDONED_DAYS = 7;
export const PRACTICE_KEEP_DAYS = 90;

export function cleanupWhere(now = Date.now()) {
  const abandonedBefore = new Date(now - ABANDONED_DAYS * 86_400_000);
  const practisedBefore = new Date(now - PRACTICE_KEEP_DAYS * 86_400_000);
  return {
    // gradingAt: null leaves a story alone while a take is being marked (its first take may be about to be saved).
    abandoned: { bankEntry: null, gradingAt: null, createdAt: { lt: abandonedBefore }, takes: { none: {} } },
    old: { bankEntry: null, gradingAt: null, takes: { some: {}, none: { createdAt: { gte: practisedBefore } } } },
  } satisfies Record<string, Prisma.StoryPracticeWhereInput>;
}

export async function cleanupStories() {
  const where = cleanupWhere();
  const abandoned = await prisma.storyPractice.deleteMany({ where: where.abandoned });
  const old = await prisma.storyPractice.deleteMany({ where: where.old });
  return { abandoned: abandoned.count, old: old.count };
}
