import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { analyzeFillers, analyzeHedges } from "../services/transcriptAnalysis";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { DeliveryStats, StoryGrade, StoryKind, storyGradePrompt, storyGradeSchema, storySetupPrompt, storySetupSchema } from "./story.prompts";

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

export async function listStories(userId: string) {
  const stories = await prisma.storyPractice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, kind: true, prompt: true, targetSeconds: true, createdAt: true, takes: { select: { score: true } } },
  });
  return stories.map(({ takes, ...s }) => ({ ...s, takes: takes.length, bestScore: takes.length ? Math.max(...takes.map((t) => t.score)) : null }));
}

export function findStory(userId: string, id: string) {
  return prisma.storyPractice.findFirst({ where: { id, userId }, include: { takes: { orderBy: { number: "asc" } } } });
}

export async function deleteStory(userId: string, id: string) {
  const deleted = await prisma.storyPractice.deleteMany({ where: { id, userId } });
  return deleted.count === 1;
}

// Typed takes (no recorded time) get a duration estimated at 150 words a minute, for the length check only.
function deliveryStats(transcript: string, recordedSec: number | null): DeliveryStats {
  const fillers = analyzeFillers(transcript);
  const durationSec = recordedSec ?? Math.max(1, Math.round((fillers.wordCount / 150) * 60));
  return {
    wordCount: fillers.wordCount,
    wpm: recordedSec ? Math.round(fillers.wordCount / (recordedSec / 60)) : null,
    durationSec,
    timed: recordedSec !== null,
    fillers: { count: fillers.count, words: fillers.words },
    hedges: analyzeHedges(transcript),
  };
}

// Grades a take and saves it. The story is claimed first (gradingAt), so a double submit is refused before a second
// AI call; a claim older than STALE_GRADING_MS can be retaken. The take is written only after grading succeeds, and
// @@unique([storyId, number]) backs up the claim.
export async function submitTake(userId: string, id: string, transcript: string, recordedSec: number | null) {
  const story = await findStory(userId, id);
  if (!story) return null;
  if (story.takes.length >= MAX_TAKES) return "full" as const;

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
    const last = takes[takes.length - 1];
    const stats = deliveryStats(transcript, recordedSec);
    const grade: StoryGrade = await generateValidated(
      storyGradePrompt({
        kind: story.kind as StoryKind,
        prompt: story.prompt,
        audience: story.audience ?? "a general audience",
        coachingNotes: parseJsonArray<string>(story.coachingNotes),
        targetSeconds: story.targetSeconds,
        transcript,
        stats,
        previous: last
          ? {
              number: last.number,
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
        number: (last?.number ?? 0) + 1,
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
