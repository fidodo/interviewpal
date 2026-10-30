import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { SHAPES, STORY_KINDS, StoryKind, TARGET_SECONDS } from "./story.prompts";
import * as storyService from "./story.service";

type Story = NonNullable<Awaited<ReturnType<typeof storyService.findStory>>>;

function notFound(res: Response) {
  res.status(404).json({ error: "Story not found" });
}

// The coaching notes (what a strong answer includes) stay hidden until the first take is graded, so the speaker
// tells it their own way first.
function serialize(s: Story) {
  return {
    id: s.id,
    kind: s.kind,
    topic: s.topic,
    audience: s.audience,
    targetSeconds: s.targetSeconds,
    prompt: s.prompt,
    shape: SHAPES[s.kind as StoryKind] ?? SHAPES.OWN,
    coachingNotes: s.takes.length ? parseJsonArray<string>(s.coachingNotes) : null,
    maxTakes: storyService.MAX_TAKES,
    takes: s.takes.map((t) => ({
      id: t.id,
      number: t.number,
      transcript: t.transcript,
      durationSec: t.durationSec,
      score: t.score,
      stats: parseJsonObject(t.stats),
      breakdown: parseJsonObject(t.breakdown),
      ...(parseJsonObject<Record<string, unknown>>(t.feedback) ?? {}),
      createdAt: t.createdAt,
    })),
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
  res.json({ story: serialize(story) });
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
  res.status(201).json({ story: serialize(result) });
}

export async function deleteStory(req: AuthedRequest, res: Response) {
  if (!(await storyService.deleteStory(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}
