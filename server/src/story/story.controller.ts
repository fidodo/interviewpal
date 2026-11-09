import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { SHAPES, STORY_KINDS, StoryKind, TARGET_SECONDS } from "./story.prompts";
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
    shape: SHAPES[s.kind as StoryKind] ?? SHAPES.OWN,
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
    createdAt: s.createdAt,
  };
}

export async function listStories(req: AuthedRequest, res: Response) {
  res.json({ stories: await storyService.listStories(req.userId!) });
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
    .safeParse(req.body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom" && i.path.length === 0);
    res.status(400).json({ error: custom?.message ?? "Pick a type and a length (topic up to 200 characters, audience up to 100)" });
    return;
  }
  const story = await storyService.createStory(req.userId!, parsed.data);
  res.status(201).json({ story: { id: story.id } });
}

export async function getStory(req: AuthedRequest, res: Response) {
  const story = await storyService.findStory(req.userId!, req.params.id);
  if (!story) return notFound(res);
  // A story saved to the bank from any of its rounds counts as saved, so it isn't banked twice.
  const banked = story.bankEntry ?? (story.round > 1 || story.nextRound ? await storyService.bankEntryForRounds(story.id) : null);
  res.json({ story: serialize(story, banked?.id ?? null) });
}

export async function submitTake(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      transcript: z.string().trim().min(20, "Say a little more before submitting (at least a sentence or two)").max(8000, "That's longer than 8,000 characters"),
      // Seconds actually recorded; null or missing for a typed take.
      durationSec: z.number().int().min(5).max(600).nullish(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.path[0] === "transcript" ? parsed.error.issues[0].message : "The recording time is missing or out of range" });
    return;
  }
  const result = await storyService.submitTake(req.userId!, req.params.id, parsed.data.transcript, parsed.data.durationSec ?? null);
  if (!result) return notFound(res);
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
  res.status(201).json({ story: { id: result.id } });
}

export async function deleteStory(req: AuthedRequest, res: Response) {
  if (!(await storyService.deleteStory(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}
