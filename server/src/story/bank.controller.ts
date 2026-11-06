import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { parseJsonArray } from "../utils/json";
import { COMPETENCIES, COMPETENCY_KEYS, drillQuestion } from "./bank.prompts";
import * as bankService from "./bank.service";
import { recordPractice } from "../today/practice.service";

function notFound(res: Response) {
  res.status(404).json({ error: "Story not found" });
}

function serialize(e: NonNullable<Awaited<ReturnType<typeof bankService.updateEntry>>>) {
  return {
    id: e.id,
    storyId: e.storyId,
    title: e.title,
    summary: e.summary,
    tags: parseJsonArray<string>(e.tags),
    bestScore: e.bestScore,
    timesUsed: e.timesUsed,
    lastUsedAt: e.lastUsedAt,
    updatedAt: e.updatedAt,
  };
}

const entrySchema = z.object({
  title: z.string().trim().min(3, "Give the story a short title").max(80, "Keep the title under 80 characters"),
  summary: z.string().trim().min(20, "Write a sentence or two about what happened").max(600, "Keep the summary under 600 characters"),
  tags: z.array(z.enum(COMPETENCY_KEYS)).min(1, "Pick at least one competency").max(3, "Pick up to three competencies"),
});

function firstIssue(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message && error.issues[0].code !== "invalid_type" ? error.issues[0].message : fallback;
}

export async function listBank(req: AuthedRequest, res: Response) {
  const entries = await bankService.listEntries(req.userId!);
  res.json({ entries: entries.map(serialize), coverage: bankService.coverage(entries), max: bankService.MAX_BANK_ENTRIES });
}

export async function suggest(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ storyId: z.string().min(1).max(40).optional(), text: z.string().trim().min(40, "Write a few sentences about what happened").max(6000).optional() })
    .refine((b) => !!b.storyId !== !!b.text, "Send a Speak story or the story's text")
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error, "Write a few sentences about what happened") });
    return;
  }
  const suggestion = await bankService.suggest(req.userId!, parsed.data);
  if (!suggestion) return notFound(res);
  if (suggestion === "noTakes") {
    res.status(409).json({ error: "Tell the story at least once before saving it." });
    return;
  }
  res.json({ suggestion });
}

export async function createEntry(req: AuthedRequest, res: Response) {
  const parsed = entrySchema.extend({ storyId: z.string().min(1).max(40).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error, "Check the title, summary and competencies") });
    return;
  }
  const entry = await bankService.createEntry(req.userId!, parsed.data);
  if (!entry) return notFound(res);
  if (entry === "full" || entry === "exists") {
    res.status(409).json({ error: entry === "full" ? `Your story bank holds up to ${bankService.MAX_BANK_ENTRIES} stories. Remove one first.` : "This story is already in your bank." });
    return;
  }
  res.status(201).json({ entry: serialize(entry) });
}

export async function updateEntry(req: AuthedRequest, res: Response) {
  const parsed = entrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error, "Check the title, summary and competencies") });
    return;
  }
  const entry = await bankService.updateEntry(req.userId!, req.params.id, parsed.data);
  if (!entry) return notFound(res);
  res.json({ entry: serialize(entry) });
}

export async function deleteEntry(req: AuthedRequest, res: Response) {
  if (!(await bankService.deleteEntry(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}

// A behavioural question from the built-in list (free).
export function drill(req: AuthedRequest, res: Response) {
  const competency = z.enum(COMPETENCY_KEYS).optional().safeParse(req.query.competency || undefined);
  res.json({ ...drillQuestion(competency.success ? competency.data : undefined), competencies: COMPETENCIES });
}

export async function judge(req: AuthedRequest, res: Response) {
  const parsed = z.object({ question: z.string().trim().min(10).max(300), entryId: z.string().min(1).max(40).nullable() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a story, or say none fits" });
    return;
  }
  const fit = await bankService.judgeFit(req.userId!, parsed.data.question, parsed.data.entryId);
  if (!fit) return notFound(res);
  res.json({ fit, rewards: await recordPractice(req.userId!, "DRILL") });
}
