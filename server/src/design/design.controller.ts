import { DESIGN_GUIDE } from "./design.rubric";
import { answerVisible, attemptInfo, attemptsLeft } from "../utils/attempts";
import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { diagramSchema } from "./design.prompts";
import * as designService from "./design.service";
import { recordPractice } from "../today/practice.service";

type Challenge = NonNullable<Awaited<ReturnType<typeof designService.findChallenge>>>;

function notFound(res: Response) {
  res.status(404).json({ error: "Design question not found" });
}

// What a strong answer covers and the model answer stay hidden until the design has been submitted; hints are
// revealed one at a time.
function serialize(c: Challenge) {
  const hints = parseJsonArray<string>(c.hints);
  const submitted = c.status === "SUBMITTED";
  // Improve and resubmit (utils/attempts.ts): what a strong answer covers and the model answer wait until the
  // learner asks for them. Results from before attempts were tracked always show them.
  const marked = parseJsonObject<Record<string, unknown>>(c.feedback);
  const attempts = attemptInfo(marked);
  const answerShown = answerVisible(attempts);
  return {
    id: c.id,
    title: c.title,
    brief: c.brief,
    // Set when the exercise came from the shared pool, for the "Was this realistic?" vote.
    poolItemId: c.poolItemId,
    level: c.level,
    requirements: parseJsonObject<{ functional: string[]; nonFunctional: string[] }>(c.requirements) ?? { functional: [], nonFunctional: [] },
    status: c.status,
    hints: hints.slice(0, c.hintsUsed),
    hintsLeft: c.status === "OPEN" ? hints.length - c.hintsUsed : 0,
    // How it's marked (design.rubric.ts), shown before submitting and with the result.
    guide: DESIGN_GUIDE,
    result: submitted
      ? {
          score: c.score,
          diagram: parseJsonObject(c.diagram) ?? { nodes: [], edges: [] },
          notes: c.notes ?? "",
          // Points-marked results have parts, reasons and toImprove; older ones a 1-10 breakdown.
          breakdown: null,
          ...(marked ?? { strengths: [], gaps: [], feedback: "", followUps: [] }),
          keyPoints: answerShown ? parseJsonArray<string>(c.keyPoints) : null,
          referenceDesign: answerShown ? c.referenceDesign : null,
          attempt: attempts?.attempt ?? 1,
          history: attempts?.history ?? [],
          attemptsLeft: attemptsLeft(attempts),
          answerShown,
        }
      : null,
    // Being improved after a mark: the last mark, for "What to work on" while editing, and the design to start from.
    previous:
      !submitted && attempts && marked
        ? {
            attempt: attempts.attempt,
            history: attempts.history,
            attemptsLeft: attemptsLeft(attempts),
            score: c.score,
            diagram: parseJsonObject(c.diagram) ?? { nodes: [], edges: [] },
            notes: c.notes ?? "",
            parts: marked.parts ?? null,
            reasons: marked.reasons ?? null,
            toImprove: Array.isArray(marked.toImprove) ? marked.toImprove : [],
            gaps: Array.isArray(marked.gaps) ? marked.gaps : [],
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
  res.status(201).json({ challenge: serialize(result), rewards: await recordPractice(req.userId!, "DESIGN", result.score) });
}

const IMPROVE_ERRORS = {
  notMarked: "This design hasn't been marked yet.",
  answerShown: "You've seen the model answer, so this design can't be resubmitted. Try another question.",
  noAttemptsLeft: "You've used every resubmit for this design. Show the model answer, or try another question.",
  changed: "This design changed in another tab. Refresh the page.",
} as const;

// "Improve and resubmit": back to editing, with the last mark kept to work from. No AI call.
export async function improve(req: AuthedRequest, res: Response) {
  const outcome = await designService.improve(req.userId!, req.params.id);
  if ("error" in outcome) {
    if (outcome.error === "notFound") return notFound(res);
    res.status(409).json({ error: IMPROVE_ERRORS[outcome.error] });
    return;
  }
  res.json({ challenge: serialize(outcome.challenge) });
}

// "Show me the model answer" after a mark, which ends resubmitting. No AI call.
export async function showAnswer(req: AuthedRequest, res: Response) {
  const challenge = await designService.showAnswer(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}
