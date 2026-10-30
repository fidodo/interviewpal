import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { parseJsonArray } from "../utils/json";
import { challengePrompt, challengeSchema, debugGradeSchema, DEBUG_LANGUAGES, DebugLanguage, gradePrompt } from "./debug.prompts";

const RECENT = 10;
const STALE_GRADING_MS = 2 * 60 * 1000;

type Bug = { description: string; hint: string };

export async function createChallenge(userId: string, language: DebugLanguage, level: string) {
  const [role, recent] = await Promise.all([
    prisma.targetRole.findFirst({ where: { userId, isActive: true }, select: { title: true } }),
    prisma.debugChallenge.findMany({ where: { userId, language }, orderBy: { createdAt: "desc" }, take: RECENT, select: { title: true } }),
  ]);
  const runnable = DEBUG_LANGUAGES[language].runnable;
  const generated = await generateValidated(
    challengePrompt({ language, level, roleTitle: role?.title ?? null, recentTitles: recent.map((r) => r.title) }),
    challengeSchema(runnable)
  );
  return prisma.debugChallenge.create({
    data: {
      userId,
      language,
      level,
      title: generated.title,
      scenario: generated.scenario,
      buggyCode: generated.buggyCode,
      spec: runnable && generated.spec ? JSON.stringify(generated.spec) : null,
      bugs: JSON.stringify(generated.bugs),
      referenceFix: generated.referenceFix,
    },
  });
}

export function listChallenges(userId: string) {
  return prisma.debugChallenge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, language: true, level: true, status: true, score: true, createdAt: true },
  });
}

export function findChallenge(userId: string, id: string) {
  return prisma.debugChallenge.findFirst({ where: { id, userId } });
}

// Reveals the next hint (stored when the challenge was written, so no AI call). The conditional write means two
// quick clicks reveal one hint, not two.
export async function useHint(userId: string, id: string) {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return null;
  const bugs = parseJsonArray<Bug>(challenge.bugs);
  if (challenge.status !== "OPEN" || challenge.hintsUsed >= bugs.length) return challenge;
  await prisma.debugChallenge.updateMany({ where: { id, hintsUsed: challenge.hintsUsed, status: "OPEN" }, data: { hintsUsed: { increment: 1 } } });
  return findChallenge(userId, id);
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
    const runnable = DEBUG_LANGUAGES[challenge.language as DebugLanguage]?.runnable ?? false;
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
