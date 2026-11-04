import { RequestHandler, Response } from "express";
import { z } from "zod";
import { AuthedRequest, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";
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
  const hinted = debugService.hintedIndexes(c);
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
    hints: hinted.map((i) => bugs[i]?.hint).filter((h): h is string => !!h),
    hintsLeft: c.status === "OPEN" ? Math.max(0, bugs.length - hinted.length) : 0,
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

// Runs middleware (e.g. rate limiters) from inside a handler. Resolves false when the middleware answered the
// request itself (e.g. a 429), so the handler must stop.
function passes(req: AuthedRequest, res: Response, middleware: RequestHandler[]): Promise<boolean> {
  return middleware.reduce<Promise<boolean>>(
    (prev, mw) =>
      prev.then(
        (ok) =>
          ok &&
          new Promise<boolean>((resolve, reject) => {
            const onFinish = () => resolve(false);
            res.once("finish", onFinish);
            mw(req, res, (err?: unknown) => {
              res.off("finish", onFinish);
              if (err) reject(err);
              else resolve(true);
            });
          })
      ),
    Promise.resolve(true)
  );
}

// A hint for a bug that's still in the learner's current code. The snippet check is free; only when it can't tell
// does one AI call settle it, and only then do the AI limits apply.
export async function useHint(req: AuthedRequest, res: Response) {
  const parsed = z.object({ code: z.string().max(20000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send your current code (up to 20,000 characters) with the hint request" });
    return;
  }
  const challenge = await debugService.findChallenge(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  if (challenge.status !== "OPEN") {
    res.json({ challenge: serialize(challenge), message: null });
    return;
  }
  let statuses = debugService.hintStatuses(challenge, parsed.data.code);
  if (statuses.includes("unclear")) {
    if (!(await passes(req, res, [requireVerified, aiLimiter, aiDailyLimiter]))) return;
    statuses = await debugService.settleWithAi(challenge, parsed.data.code, statuses);
  }
  const outcome = await debugService.giveHint(req.userId!, challenge, statuses);
  res.json({ challenge: serialize(outcome.challenge), message: outcome.message });
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
