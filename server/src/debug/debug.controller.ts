import { answerVisible, attemptInfo, attemptsLeft } from "../utils/attempts";
import { Response } from "express";
import { z } from "zod";
import { AuthedRequest, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";
import { Difficulty } from "../types";
import { parseJsonArray, parseJsonObject as parseObject } from "../utils/json";
import { DEBUG_LANGUAGE_KEYS, DEBUG_LANGUAGES, DebugLanguage } from "./debug.prompts";
import { DEBUG_GUIDE } from "./debug.rubric";
import * as debugService from "./debug.service";
import { passes } from "../middleware/runMiddleware";
import { recordPractice } from "../today/practice.service";

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
  const revealed = c.status === "REVEALED";
  const revealInfo = revealed ? (parseObject<{ fixed: boolean[] }>(c.feedback)?.fixed ?? bugs.map(() => false)) : null;
  // Improve and resubmit (utils/attempts.ts): the bugs, what was missed and the reference fix wait until the answer
  // is shown. Results from before attempts were tracked always show them.
  const marked = parseObject<Record<string, unknown>>(c.feedback);
  const attempts = attemptInfo(marked);
  const answerShown = answerVisible(attempts);
  return {
    id: c.id,
    title: c.title,
    scenario: c.scenario,
    language: c.language,
    // Exercises written before a language became runnable have no spec, and stay AI-reviewed.
    runnable: (DEBUG_LANGUAGES[c.language as DebugLanguage]?.runnable ?? false) && c.spec != null,
    // Set when the exercise came from the shared pool, for the "Was this realistic?" vote.
    poolItemId: c.poolItemId,
    level: c.level,
    buggyCode: c.buggyCode,
    spec: parseObject(c.spec),
    // How a fix is scored, for the "How it's marked" card (debug.rubric.ts).
    guide: DEBUG_GUIDE,
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
          ...((marked as { bugsFixed: number; feedback: string; missed: string[] } | null) ?? { bugsFixed: 0, feedback: "", missed: [] }),
          // parts, reasons and toImprove come through the spread above for results marked with the rubric.
          ...(answerShown ? {} : { missed: [] }),
          bugs: answerShown ? bugs.map((b) => b.description) : null,
          referenceFix: answerShown ? c.referenceFix : null,
          attempt: attempts?.attempt ?? 1,
          history: attempts?.history ?? [],
          attemptsLeft: attemptsLeft(attempts),
          answerShown,
        }
      : revealed && revealInfo
        ? {
            // "Show me the answer": no score; what was fixed when the learner gave up, bug by bug.
            revealed: true,
            score: null,
            submittedCode: c.submittedCode,
            explanation: null,
            testResults: null,
            fixed: bugs.map((_, i) => !!revealInfo[i]),
            bugsFixed: revealInfo.filter(Boolean).length,
            feedback: "",
            missed: bugs.filter((_, i) => !revealInfo[i]).map((b) => b.description),
            bugHints: bugs.map((b, i) => (hinted.includes(i) ? b.hint : null)),
            bugs: bugs.map((b) => b.description),
            referenceFix: c.referenceFix,
          }
        : null,
    // Being improved after a mark: the last mark, for "What to work on" while editing, and the code to start from.
    previous:
      c.status !== "SUBMITTED" && c.status !== "REVEALED" && attempts && marked
        ? {
            attempt: attempts.attempt,
            history: attempts.history,
            attemptsLeft: attemptsLeft(attempts),
            score: c.score,
            submittedCode: c.submittedCode ?? "",
            explanation: c.explanation ?? "",
            testResults: parseObject(c.testResults),
            bugsFixed: typeof marked.bugsFixed === "number" ? marked.bugsFixed : 0,
            feedback: typeof marked.feedback === "string" ? marked.feedback : "",
            parts: marked.parts ?? null,
            reasons: marked.reasons ?? null,
            toImprove: Array.isArray(marked.toImprove) ? marked.toImprove : [],
          }
        : null,
  };
}

// ?status=open|done&page=1-1000&limit=1-30. Anything unrecognised falls back to the defaults (To finish, page 1).
// `before=<id>` (and status=all) is the older "Show more" list, kept for a browser still running the previous page.
const listQuerySchema = z.object({
  status: z.enum(["all", "open", "done"]).catch("open"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  before: z.string().trim().min(1).max(64).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(30).catch(10),
});

export async function listChallenges(req: AuthedRequest, res: Response) {
  const q = listQuerySchema.parse({ status: req.query.status ?? "open", page: req.query.page ?? 1, before: req.query.before, limit: req.query.limit ?? 10 });
  const legacy = q.before !== undefined;
  const filter = q.status === "all" && !legacy ? "open" : q.status;
  const [page, counts] = await Promise.all([
    legacy
      ? debugService.listChallenges(req.userId!, { filter, before: q.before, limit: q.limit })
      : debugService.listChallengePage(req.userId!, { filter, page: q.page, limit: q.limit }),
    debugService.challengeCounts(req.userId!),
  ]);
  res.json({ ...page, counts });
}

export async function createChallenge(req: AuthedRequest, res: Response) {
  const parsed = z
    .union([
      z.object({ language: z.enum(DEBUG_LANGUAGE_KEYS), level: z.nativeEnum(Difficulty) }),
      // "Try a similar one": the same stack, level and kinds of bugs as one of your own exercises.
      z.object({ similarTo: z.string().min(1).max(40) }),
    ])
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a language and a level" });
    return;
  }
  let language: DebugLanguage, level: string, similarBugs: string[] | undefined;
  if ("similarTo" in parsed.data) {
    const source = await debugService.findChallenge(req.userId!, parsed.data.similarTo);
    if (!source || !(source.language in DEBUG_LANGUAGES)) return notFound(res);
    language = source.language as DebugLanguage;
    level = source.level;
    similarBugs = parseJsonArray<{ description: string }>(source.bugs).map((b) => b.description.slice(0, 300));
  } else {
    ({ language, level } = parsed.data);
  }
  const challenge = await debugService.createChallenge(req.userId!, language, level, similarBugs);
  res.status(201).json({ challenge: { id: challenge.id } });
}

export async function getChallenge(req: AuthedRequest, res: Response) {
  const challenge = await debugService.findChallenge(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
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

// "Show me the answer": works out which bugs the learner's current code fixes (free check, AI only for unclear ones),
// then closes the exercise unscored and returns the full answer.
export async function revealAnswer(req: AuthedRequest, res: Response) {
  const parsed = z.object({ code: z.string().max(20000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send your current code (up to 20,000 characters)" });
    return;
  }
  const challenge = await debugService.findChallenge(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  // Being improved after a mark: showing the answer keeps the last mark (no code check needed).
  if (challenge.status === "OPEN" && challenge.feedback != null) {
    const shown = await debugService.showAnswer(req.userId!, challenge.id);
    res.json({ challenge: serialize(shown ?? challenge) });
    return;
  }
  if (challenge.status !== "OPEN") {
    res.status(409).json({ error: "This exercise has already been submitted or its answer shown." });
    return;
  }
  let statuses = debugService.hintStatuses(challenge, parsed.data.code);
  if (statuses.includes("unclear")) {
    if (!(await passes(req, res, [requireVerified, aiLimiter, aiDailyLimiter]))) return;
    statuses = await debugService.settleWithAi(challenge, parsed.data.code, statuses);
  }
  const revealed = await debugService.revealAnswer(req.userId!, challenge, parsed.data.code, statuses);
  if (!revealed) {
    res.status(409).json({ error: "This exercise has already been submitted or its answer shown." });
    return;
  }
  res.json({ challenge: serialize(revealed) });
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
  res.status(201).json({ challenge: serialize(result), rewards: await recordPractice(req.userId!, "DEBUG", result.score) });
}

const IMPROVE_ERRORS = {
  notMarked: "This exercise hasn't been marked yet.",
  answerShown: "You've seen the answer, so this exercise can't be resubmitted. Try a similar one instead.",
  noAttemptsLeft: "You've used every resubmit for this exercise. Show the answer, or try a similar one.",
  changed: "This exercise changed in another tab. Refresh the page.",
} as const;

// "Improve and resubmit": back to editing, with the last mark kept to work from. No AI call.
export async function improve(req: AuthedRequest, res: Response) {
  const outcome = await debugService.improve(req.userId!, req.params.id);
  if ("error" in outcome) {
    if (outcome.error === "notFound") return notFound(res);
    res.status(409).json({ error: IMPROVE_ERRORS[outcome.error] });
    return;
  }
  res.json({ challenge: serialize(outcome.challenge) });
}

// "Show me the answer" after a mark: the bugs and the reference fix, which ends resubmitting. No AI call.
export async function showAnswer(req: AuthedRequest, res: Response) {
  const challenge = await debugService.showAnswer(req.userId!, req.params.id);
  if (!challenge) return notFound(res);
  res.json({ challenge: serialize(challenge) });
}
