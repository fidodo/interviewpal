import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { parseJsonArray } from "../utils/json";
import {
  challengePrompt,
  challengeSchema,
  debugGradeSchema,
  DEBUG_LANGUAGES,
  DebugLanguage,
  GeneratedBug,
  gradePrompt,
  hintCheckPrompt,
  hintCheckSchema,
  MIN_CODE_LINES,
} from "./debug.prompts";
import { canFormat, formatCode, normaliseCode } from "./format";

const RECENT = 10;
const STALE_GRADING_MS = 2 * 60 * 1000;

type Bug = { description: string; hint: string; buggySnippet?: string | null; fixedSnippet?: string | null };
type Challenge = NonNullable<Awaited<ReturnType<typeof findChallenge>>>;
export type BugStatus = "present" | "fixed" | "unclear";

// Keeps a bug's snippets only if they locate it: the buggy one is in the buggy code but not the fix, and the fixed one
// is in the fix. Compared without layout, so formatting the code afterwards doesn't break the match.
function checkSnippets(bug: GeneratedBug, buggyCode: string, referenceFix: string): Bug {
  const code = normaliseCode(buggyCode);
  const fix = normaliseCode(referenceFix);
  const buggy = bug.buggySnippet ? normaliseCode(bug.buggySnippet) : "";
  const fixed = bug.fixedSnippet ? normaliseCode(bug.fixedSnippet) : "";
  const valid = buggy.length >= 3 && fixed.length >= 1 && code.includes(buggy) && !fix.includes(buggy) && fix.includes(fixed);
  return { description: bug.description, hint: bug.hint, buggySnippet: valid ? bug.buggySnippet : null, fixedSnippet: valid ? bug.fixedSnippet : null };
}

// Whether a planted bug is still in the learner's code: the buggy snippet still there means present; gone with the
// fixed snippet there means fixed; anything else (an unusual edit, or no usable snippets) is unclear.
export function bugStatus(bug: Bug, code: string): BugStatus {
  if (!bug.buggySnippet || !bug.fixedSnippet) return "unclear";
  const current = normaliseCode(code);
  if (current.includes(normaliseCode(bug.buggySnippet))) return "present";
  return current.includes(normaliseCode(bug.fixedSnippet)) ? "fixed" : "unclear";
}

// Bug indexes already hinted, in order. Challenges from before hintedBugs existed revealed hints in bug order.
export function hintedIndexes(c: { hintedBugs: string; hintsUsed: number }): number[] {
  const stored = parseJsonArray<number>(c.hintedBugs);
  return stored.length || !c.hintsUsed ? stored : Array.from({ length: c.hintsUsed }, (_, i) => i);
}

export async function createChallenge(userId: string, language: DebugLanguage, level: string, similarBugs?: string[]) {
  const [role, recent] = await Promise.all([
    prisma.targetRole.findFirst({ where: { userId, isActive: true }, select: { title: true } }),
    prisma.debugChallenge.findMany({ where: { userId, language }, orderBy: { createdAt: "desc" }, take: RECENT, select: { title: true } }),
  ]);
  const runnable = DEBUG_LANGUAGES[language].runnable;
  const generated = await generateValidated(
    challengePrompt({ language, level, roleTitle: role?.title ?? null, recentTitles: recent.map((r) => r.title), similarBugs }),
    challengeSchema(runnable)
  );
  const [buggyCode, referenceFix] = await Promise.all([formatCode(language, generated.buggyCode), formatCode(language, generated.referenceFix)]);
  return prisma.debugChallenge.create({
    data: {
      userId,
      language,
      level,
      title: generated.title,
      scenario: generated.scenario,
      buggyCode,
      spec: runnable && generated.spec ? JSON.stringify(generated.spec) : null,
      bugs: JSON.stringify(generated.bugs.map((b) => checkSnippets(b, buggyCode, referenceFix))),
      referenceFix,
    },
  });
}

// "To finish" is anything not yet closed (being marked counts); "done" is scored or answer shown.
export const LIST_FILTERS = { all: undefined, open: ["OPEN", "GRADING"], done: ["SUBMITTED", "REVEALED"] } as const;
export type ListFilter = keyof typeof LIST_FILTERS;

// One page of "Your challenges", newest first. `before` is the id of the last challenge already shown: the page
// continues after it (by createdAt, then id), so a challenge created while paging can't shift or repeat rows. The
// cursor is looked up within the user's own challenges, so someone else's id gives an empty page.
export async function listChallenges(userId: string, opts: { filter: ListFilter; before?: string; limit: number }) {
  const statuses = LIST_FILTERS[opts.filter];
  const where: Prisma.DebugChallengeWhereInput = { userId, ...(statuses ? { status: { in: [...statuses] } } : {}) };
  if (opts.before) {
    const cursor = await prisma.debugChallenge.findFirst({ where: { id: opts.before, userId }, select: { id: true, createdAt: true } });
    if (!cursor) return { challenges: [], hasMore: false };
    where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }];
  }
  const rows = await prisma.debugChallenge.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    select: { id: true, title: true, language: true, level: true, status: true, score: true, createdAt: true },
  });
  return { challenges: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
}

// How many challenges each filter holds, for the filter buttons.
export async function challengeCounts(userId: string) {
  const groups = await prisma.debugChallenge.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } });
  const count = (statuses: readonly string[]) => groups.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return { all: groups.reduce((n, g) => n + g._count._all, 0), open: count(LIST_FILTERS.open), done: count(LIST_FILTERS.done) };
}

export async function findChallenge(userId: string, id: string) {
  const challenge = await prisma.debugChallenge.findFirst({ where: { id, userId } });
  if (!challenge || challenge.status !== "OPEN" || !canFormat(challenge.language)) return challenge;
  // Older exercises were sometimes stored on one line: format them the first time they're opened. The write is
  // conditional on the old code, so it happens once.
  if (challenge.buggyCode.split("\n").length >= MIN_CODE_LINES) return challenge;
  const [buggyCode, referenceFix] = await Promise.all([formatCode(challenge.language, challenge.buggyCode), formatCode(challenge.language, challenge.referenceFix)]);
  if (buggyCode === challenge.buggyCode) return challenge;
  await prisma.debugChallenge.updateMany({ where: { id, buggyCode: challenge.buggyCode }, data: { buggyCode, referenceFix } });
  return { ...challenge, buggyCode, referenceFix };
}

// Hint step 1: where each planted bug stands in the learner's current code, by the free snippet check.
export function hintStatuses(challenge: Challenge, code: string) {
  return parseJsonArray<Bug>(challenge.bugs).map((b) => bugStatus(b, code));
}

// Hint step 2, only when step 1 couldn't tell for some bugs: one AI call settles those, and only those.
export async function settleWithAi(challenge: Challenge, code: string, statuses: BugStatus[]): Promise<BugStatus[]> {
  const bugs = parseJsonArray<Bug>(challenge.bugs);
  const unclear = statuses.map((s, i) => (s === "unclear" ? i : -1)).filter((i) => i >= 0);
  if (!unclear.length) return statuses;
  const { stillPresent } = await generateValidated(
    hintCheckPrompt({
      language: challenge.language as DebugLanguage,
      buggyCode: challenge.buggyCode,
      bugs: unclear.map((i) => ({ index: i + 1, description: bugs[i].description })),
      code,
    }),
    hintCheckSchema
  );
  const present = new Set(stillPresent.map((n) => n - 1));
  return statuses.map((s, i) => (s === "unclear" ? (present.has(i) ? "present" : "fixed") : s));
}

export type HintOutcome = { challenge: Challenge; message: string | null };

// Hint step 3: the hint for the first bug that's still in the code and hasn't had one. Nothing is used up when every
// bug looks fixed, or every remaining bug has had its hint already. The conditional write means two quick clicks
// reveal one hint, not two.
export async function giveHint(userId: string, challenge: Challenge, statuses: BugStatus[]): Promise<HintOutcome> {
  const hinted = hintedIndexes(challenge);
  const present = statuses.map((s, i) => (s === "present" ? i : -1)).filter((i) => i >= 0);
  if (!present.length) return { challenge, message: "Your code looks like it fixes every planted bug. Run the tests or submit it." };
  const next = present.find((i) => !hinted.includes(i));
  if (next === undefined) {
    return { challenge, message: `You've had a hint for every bug still in your code. Re-read hint ${hinted.indexOf(present[0]) + 1}.` };
  }
  await prisma.debugChallenge.updateMany({
    where: { id: challenge.id, hintsUsed: challenge.hintsUsed, status: "OPEN" },
    data: { hintsUsed: { increment: 1 }, hintedBugs: JSON.stringify([...hinted, next]) },
  });
  return { challenge: (await findChallenge(userId, challenge.id))!, message: null };
}

// "Show me the answer": closes the exercise unscored and records which bugs the learner had fixed. The conditional
// write on status OPEN means it can't race a submit (which also only claims OPEN) or a second reveal.
export async function revealAnswer(userId: string, challenge: Challenge, code: string, statuses: BugStatus[]) {
  const claimed = await prisma.debugChallenge.updateMany({
    where: { id: challenge.id, userId, status: "OPEN" },
    data: {
      status: "REVEALED",
      submittedCode: code,
      feedback: JSON.stringify({ revealed: true, fixed: statuses.map((s) => s === "fixed") }),
      score: null,
      submittedAt: new Date(),
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.debugChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
}

// Grades a fix once. The challenge is claimed (OPEN -> GRADING) first so a double submit can't grade twice; if
// the AI call fails it goes back to OPEN so the learner can try again.
export async function submitFix(
  userId: string,
  id: string,
  submission: { code: string; explanation: string; testResults: { passed: number; total: number } | null }
) {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return null;
  // A grading claim older than STALE_GRADING_MS was abandoned (e.g. the serverless function timed out) and can be retaken.
  const claimedAt = new Date();
  const claimed = await prisma.debugChallenge.updateMany({
    where: { id, OR: [{ status: "OPEN" }, { status: "GRADING", submittedAt: { lt: new Date(Date.now() - STALE_GRADING_MS) } }] },
    data: { status: "GRADING", submittedAt: claimedAt },
  });
  if (claimed.count !== 1) return "alreadySubmitted" as const;

  try {
    // Re-read after the claim, so a hint revealed just before it is counted.
    const { hintsUsed } = await prisma.debugChallenge.findUniqueOrThrow({ where: { id }, select: { hintsUsed: true } });
    const bugs = parseJsonArray<Bug>(challenge.bugs);
    const runnable = (DEBUG_LANGUAGES[challenge.language as DebugLanguage]?.runnable ?? false) && challenge.spec != null;
    const testResults = runnable ? submission.testResults : null;
    const grade = await generateValidated(
      gradePrompt({
        language: challenge.language as DebugLanguage,
        level: challenge.level,
        scenario: challenge.scenario,
        buggyCode: challenge.buggyCode,
        bugs,
        referenceFix: challenge.referenceFix,
        submittedCode: submission.code,
        explanation: submission.explanation,
        testResults,
        hintsUsed,
      }),
      debugGradeSchema
    );
    // Only the request holding this claim may write the result (a stale claim may have been retaken).
    await prisma.debugChallenge.updateMany({
      where: { id, status: "GRADING", submittedAt: claimedAt },
      data: {
        status: "SUBMITTED",
        submittedCode: submission.code,
        explanation: submission.explanation,
        testResults: testResults ? JSON.stringify(testResults) : null,
        score: grade.score,
        feedback: JSON.stringify({ bugsFixed: Math.min(grade.bugsFixed, bugs.length), feedback: grade.feedback, missed: grade.missed }),
        submittedAt: new Date(),
      },
    });
    return await prisma.debugChallenge.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    await prisma.debugChallenge.updateMany({ where: { id, status: "GRADING", submittedAt: claimedAt }, data: { status: "OPEN" } });
    throw err;
  }
}
