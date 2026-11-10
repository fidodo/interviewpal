import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { MAX_CONVERSATION_TURNS, MIN_CONVERSATION_TURNS, STORY_KINDS, TARGET_SECONDS, VOICE_TARGETS, shapeFor, voiceSchema } from "./story.prompts";
import { FRAMEWORKS, frameworksForKind } from "./story.frameworks";
import { DRILLS, DRILL_KINDS, DRILL_LIST, isDrill } from "./story.drills";
import * as storyService from "./story.service";
import { SCORE_GUIDE, deliveryCheck } from "./story.rubric";
import { recordPractice } from "../today/practice.service";

type Story = NonNullable<Awaited<ReturnType<typeof storyService.findStory>>>;

function notFound(res: Response) {
  res.status(404).json({ error: "Story not found" });
}

// The coaching notes (what a strong answer includes) stay hidden until the first take is graded, so the speaker
// tells it their own way first.
function serialize(s: Story, bankEntryId: string | null = s.bankEntry?.id ?? null) {
  return {
    id: s.id,
    kind: s.kind,
    topic: s.topic,
    audience: s.audience,
    targetSeconds: s.targetSeconds,
    prompt: s.prompt,
    shape: shapeFor(s.kind),
    // "How to shape it": the kind's framework, plus the keys of others that also fit (/speak/frameworks has them).
    framework: frameworksForKind(s.kind),
    // For a 1-minute drill: its name and the dimension it trains (its feedback comes first). Null for stories.
    drill: isDrill(s.kind) ? { label: DRILLS[s.kind].label, focus: DRILLS[s.kind].focus } : null,
    // From round 2 the speaker has already told it, so the notes show from the start.
    coachingNotes: s.takes.length || s.round > 1 ? parseJsonArray<string>(s.coachingNotes) : null,
    round: s.round,
    continuesFromId: s.continuesFromId,
    nextRoundId: s.nextRound?.id ?? null,
    maxTakes: storyService.MAX_TAKES,
    // Set once the story has been saved to the story bank.
    bankEntryId,
    takes: s.takes.map((t) => {
      const stats = parseJsonObject<Parameters<typeof deliveryCheck>[0]>(t.stats);
      return {
        id: t.id,
        number: t.number,
        transcript: t.transcript,
        durationSec: t.durationSec,
        score: t.score,
        stats,
        // Length and fillers against the targets, worked out the same way as for the marker.
        delivery: stats ? deliveryCheck(stats, s.targetSeconds) : null,
        breakdown: parseJsonObject(t.breakdown),
        reasons: null,
        ...(parseJsonObject<Record<string, unknown>>(t.feedback) ?? {}),
        createdAt: t.createdAt,
      };
    }),
    // What each score means, for the "What a good score looks like" guide (the marker uses the same text).
    guide: SCORE_GUIDE,
    // What the voice figures mean (flat pitch, trail-off, long pauses), for the take result.
    voiceTargets: VOICE_TARGETS,
    // Conversations: how many turns the speaker gets, and how many before feedback.
    conversation: s.kind === "CONVERSATION" ? { maxTurns: MAX_CONVERSATION_TURNS, minTurns: MIN_CONVERSATION_TURNS } : null,
    createdAt: s.createdAt,
  };
}

export async function listStories(req: AuthedRequest, res: Response) {
  // The frameworks ride along so /speak and /speak/frameworks have one source (static, no AI).
  res.json({ stories: await storyService.listStories(req.userId!), frameworks: FRAMEWORKS, drills: DRILL_LIST });
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export async function createStory(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      kind: z.enum(STORY_KINDS),
      topic: optionalText(200),
      audience: optionalText(100),
      targetSeconds: z.number().refine((n) => (TARGET_SECONDS as readonly number[]).includes(n)),
    })
    .refine((b) => b.kind !== "OWN" || !!b.topic, "Type the topic you want to talk about")
    .refine((b) => b.kind !== "CONVERSATION" || !!b.topic, "Pick or describe the conversation")
    .safeParse(req.body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom" && i.path.length === 0);
    res.status(400).json({ error: custom?.message ?? "Pick a type and a length (topic up to 200 characters, audience up to 100)" });
    return;
  }
  const story = await storyService.createStory(req.userId!, parsed.data);
  res.status(201).json({ story: { id: story.id } });
}

// A 1-minute drill: no AI call (the prompt comes from a fixed list), so it's behind drillLimiter, not the allowance.
export async function createDrill(req: AuthedRequest, res: Response) {
  const parsed = z.object({ kind: z.enum(DRILL_KINDS) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a drill" });
    return;
  }
  res.status(201).json({ story: await storyService.createDrill(req.userId!, parsed.data.kind) });
}

export async function getStory(req: AuthedRequest, res: Response) {
  const story = await storyService.findStory(req.userId!, req.params.id);
  if (!story) return notFound(res);
  // A story saved to the bank from any of its rounds counts as saved, so it isn't banked twice.
  const banked = story.bankEntry ?? (story.round > 1 || story.nextRound ? await storyService.bankEntryForRounds(story.id) : null);
  res.json({ story: serialize(story, banked?.id ?? null) });
}

// A conversation's turns as sent by the browser: the speaker first, then alternating, ending with the speaker.
const turnsSchema = z
  .array(z.object({ role: z.enum(["you", "them"]), text: z.string().trim().min(1).max(1500) }))
  .min(1)
  .max(MAX_CONVERSATION_TURNS * 2)
  .refine((turns) => turns.every((t, i) => t.role === (i % 2 === 0 ? "you" : "them")), "Turns must alternate, starting with yours")
  .refine((turns) => turns.filter((t) => t.role === "you").length <= MAX_CONVERSATION_TURNS, "Too many turns");

// The other person's next line in a conversation (AI). Behind conversationLimiter, not the interview allowance.
export async function conversationReply(req: AuthedRequest, res: Response) {
  const parsed = z.object({ turns: turnsSchema.refine((t) => t[t.length - 1].role === "you", "Say something first") }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Send the conversation so far" });
    return;
  }
  const result = await storyService.conversationReply(req.userId!, req.params.id, parsed.data.turns);
  if (!result) return notFound(res);
  if (result === "full" || result === "over") {
    res.status(409).json({ error: result === "full" ? `You've used all ${storyService.MAX_TAKES} takes for this conversation.` : "That's the end of this conversation. Get your feedback." });
    return;
  }
  res.json(result);
}

export async function submitTake(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      // A story's or drill's transcript; a conversation sends turns instead.
      transcript: z.string().trim().min(20, "Say a little more before submitting (at least a sentence or two)").max(8000, "That's longer than 8,000 characters").optional(),
      turns: turnsSchema.optional(),
      // Seconds actually recorded; null or missing for a typed take.
      durationSec: z.number().int().min(5).max(600).nullish(),
      // Pauses, pitch range and trail-off, measured in the browser from the recording. Optional.
      voice: voiceSchema.nullish(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    res
      .status(400)
      .json({ error: field === "transcript" || field === "turns" ? parsed.error.issues[0].message : field === "voice" ? "The voice measurements are out of range" : "The recording time is missing or out of range" });
    return;
  }
  const result = await storyService.submitTake(
    req.userId!,
    req.params.id,
    { transcript: parsed.data.transcript ?? null, turns: parsed.data.turns ?? null },
    parsed.data.durationSec ?? null,
    parsed.data.voice ?? null
  );
  if (!result) return notFound(res);
  if (result === "transcript" || result === "turns") {
    res.status(400).json({ error: result === "transcript" ? "Say a little more before submitting (at least a sentence or two)" : `Take at least ${MIN_CONVERSATION_TURNS} turns before getting feedback.` });
    return;
  }
  if (result === "full") {
    res.status(409).json({ error: `You've used all ${storyService.MAX_TAKES} takes for this story. Start a new one.` });
    return;
  }
  if (result === "busy") {
    res.status(409).json({ error: "This take is already being marked. Refresh in a moment to see it." });
    return;
  }
  const latest = result!.takes[result!.takes.length - 1];
  const banked = result!.bankEntry ?? (result!.round > 1 ? await storyService.bankEntryForRounds(result!.id) : null);
  res.status(201).json({ story: serialize(result!, banked?.id ?? null), rewards: await recordPractice(req.userId!, "SPEAK", latest?.score ?? null) });
}

export async function practiseAgain(req: AuthedRequest, res: Response) {
  const result = await storyService.practiseAgain(req.userId!, req.params.id);
  if (!result) return notFound(res);
  if (result === "not-full") {
    res.status(409).json({ error: `Use all ${storyService.MAX_TAKES} takes first, then start the next round.` });
    return;
  }
  if (result === "drill") {
    res.status(409).json({ error: "Drills don't have rounds. Start a new drill instead." });
    return;
  }
  res.status(201).json({ story: { id: result.id } });
}

export async function deleteStory(req: AuthedRequest, res: Response) {
  if (!(await storyService.deleteStory(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}
