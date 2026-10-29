import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import { parseJsonArray, parseJsonObject as parseObject } from "../utils/json";
import { DEBUG_LANGUAGE_KEYS, DEBUG_LANGUAGES, DebugLanguage } from "./debug.prompts";
import * as debugService from "./debug.service";

type Challenge = NonNullable<Awaited<ReturnType<typeof debugService.findChallenge>>>;

function notFound(res: Response) {
  res.status(404).json({ error: "Challenge not found" });
}

// The planted bugs and the reference fix stay hidden until the challenge has been submitted; hints are revealed
// one at a time.
function serialize(c: Challenge) {
  const bugs = parseJsonArray<{ description: string; hint: string }>(c.bugs);
  const submitted = c.status === "SUBMITTED";
  return {
    id: c.id,
    title: c.title,
    scenario: c.scenario,
    language: c.language,
    runnable: DEBUG_LANGUAGES[c.language as DebugLanguage]?.runnable ?? false,
    level: c.level,
    buggyCode: c.buggyCode,
    spec: parseObject(c.spec),
    status: c.status,
    bugCount: bugs.length,
    hints: bugs.slice(0, c.hintsUsed).map((b) => b.hint),
    hintsLeft: c.status === "OPEN" ? bugs.length - c.hintsUsed : 0,
    result: submitted
      ? {
          score: c.score,
          submittedCode: c.submittedCode,
          explanation: c.explanation,
          testResults: parseObject(c.testResults),
          ...(parseObject<{ bugsFixed: number; feedback: string; missed: string[] }>(c.feedback) ?? { bugsFixed: 0, feedback: "", missed: [] }),
          bugs: bugs.map((b) => b.description),
          referenceFix: c.referenceFix,
        }
      : null,
  };
}

export async function listChallenges(req: AuthedRequest, res: Response) {
  res.json({ challenges: await debugService.listChallenges(req.userId!) });
}

export async function createChallenge(req: AuthedRequest, res: Response) {
  const parsed = z.object({ language: z.enum(DEBUG_LANGUAGE_KEYS), level: z.nativeEnum(Difficulty) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a language and a level" });
    return;
  }
  const challenge = await debugService.createChallenge(req.userId!, parsed.data.language, parsed.data.level);
  res.status(201).json({ challenge: { id: challenge.id } });
}

export async function getChallenge(req: AuthedRequest, res: Response) {
  const challenge = await debugService.findChallenge(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}

export async function useHint(req: AuthedRequest, res: Response) {
  const challenge = await debugService.useHint(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}

export async function submitFix(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      code: z.string().min(1).max(20000),
      explanation: z.string().max(3000).default(""),
      testResults: z
        .object({ passed: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) })
        .refine((r) => r.passed <= r.total)
        .nullish(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Submit your fixed code (and optionally what was wrong)" });
    return;
  }
  const result = await debugService.submitFix(req.userId!, req.params.id, { ...parsed.data, testResults: parsed.data.testResults ?? null });
  if (!result) return notFound(res);
  if (result === "alreadySubmitted") {
    res.status(409).json({ error: "This fix is already being graded or was submitted. Refresh the page in a moment to see the result." });
    return;
  }
  res.status(201).json({ challenge: serialize(result) });
}
