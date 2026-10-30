import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { diagramSchema } from "./design.prompts";
import * as designService from "./design.service";

type Challenge = NonNullable<Awaited<ReturnType<typeof designService.findChallenge>>>;

function notFound(res: Response) {
  res.status(404).json({ error: "Design question not found" });
}

// What a strong answer covers and the model answer stay hidden until the design has been submitted; hints are
// revealed one at a time.
function serialize(c: Challenge) {
  const hints = parseJsonArray<string>(c.hints);
  const submitted = c.status === "SUBMITTED";
  return {
    id: c.id,
    title: c.title,
    brief: c.brief,
    level: c.level,
    requirements: parseJsonObject<{ functional: string[]; nonFunctional: string[] }>(c.requirements) ?? { functional: [], nonFunctional: [] },
    status: c.status,
    hints: hints.slice(0, c.hintsUsed),
    hintsLeft: c.status === "OPEN" ? hints.length - c.hintsUsed : 0,
    result: submitted
      ? {
          score: c.score,
          diagram: parseJsonObject(c.diagram) ?? { nodes: [], edges: [] },
          notes: c.notes ?? "",
          ...(parseJsonObject(c.feedback) ?? { breakdown: null, strengths: [], gaps: [], feedback: "", followUps: [] }),
          keyPoints: parseJsonArray<string>(c.keyPoints),
          referenceDesign: c.referenceDesign,
        }
      : null,
  };
}

export async function listChallenges(req: AuthedRequest, res: Response) {
  res.json({ challenges: await designService.listChallenges(req.userId!) });
}

export async function createChallenge(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ level: z.nativeEnum(Difficulty), topic: z.string().trim().max(120).nullish() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a level (and optionally what to design, up to 120 characters)" });
    return;
  }
  const challenge = await designService.createChallenge(req.userId!, parsed.data.level, parsed.data.topic || null);
  res.status(201).json({ challenge: { id: challenge.id } });
}

export async function getChallenge(req: AuthedRequest, res: Response) {
  const challenge = await designService.findChallenge(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}

export async function useHint(req: AuthedRequest, res: Response) {
  const challenge = await designService.useHint(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}

export async function submitDesign(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ diagram: diagramSchema, notes: z.string().max(6000).default("") })
    .refine((b) => b.diagram.nodes.length > 0 || b.notes.trim().length > 0, "Draw at least one component or write some notes before submitting")
    .safeParse(req.body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    res.status(400).json({ error: custom?.message ?? "The diagram couldn't be read: check names are 40 characters or fewer" });
    return;
  }
  const result = await designService.submitDesign(req.userId!, req.params.id, { diagram: parsed.data.diagram, notes: parsed.data.notes.trim() });
  if (!result) return notFound(res);
  if (result === "alreadySubmitted") {
    res.status(409).json({ error: "This design is already being graded or was submitted. Refresh the page in a moment to see the result." });
    return;
  }
  res.status(201).json({ challenge: serialize(result) });
}
