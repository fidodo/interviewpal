import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { challengePrompt, challengeSchema, designGradeSchema, Diagram, gradePrompt } from "./design.prompts";

const RECENT = 10;
const STALE_GRADING_MS = 2 * 60 * 1000;

export async function createChallenge(userId: string, level: string, topic: string | null) {
  const [role, recent] = await Promise.all([
    prisma.targetRole.findFirst({ where: { userId, isActive: true }, select: { title: true } }),
    prisma.designChallenge.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: RECENT, select: { title: true } }),
  ]);
  const generated = await generateValidated(
    challengePrompt({ level, topic, roleTitle: role?.title ?? null, recentTitles: recent.map((r) => r.title) }),
    challengeSchema
  );
  return prisma.designChallenge.create({
    data: {
      userId,
      level,
      title: generated.title,
      brief: generated.brief,
      requirements: JSON.stringify({ functional: generated.functional, nonFunctional: generated.nonFunctional }),
      hints: JSON.stringify(generated.hints),
      keyPoints: JSON.stringify(generated.keyPoints),
      referenceDesign: generated.referenceDesign,
    },
  });
}

export function listChallenges(userId: string) {
  return prisma.designChallenge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, level: true, status: true, score: true, createdAt: true },
  });
}

export function findChallenge(userId: string, id: string) {
  return prisma.designChallenge.findFirst({ where: { id, userId } });
}

// Reveals the next hint (written with the question, so no AI call). The conditional write means two quick clicks
// reveal one hint, not two.
export async function useHint(userId: string, id: string) {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return null;
  if (challenge.status !== "OPEN" || challenge.hintsUsed >= parseJsonArray(challenge.hints).length) return challenge;
  await prisma.designChallenge.updateMany({ where: { id, hintsUsed: challenge.hintsUsed, status: "OPEN" }, data: { hintsUsed: { increment: 1 } } });
  return findChallenge(userId, id);
}

// Grades a design once, with the same claim as debug practice: OPEN -> GRADING first so a double submit can't grade
// twice, a claim older than STALE_GRADING_MS can be retaken, and on failure it goes back to OPEN.
export async function submitDesign(userId: string, id: string, submission: { diagram: Diagram; notes: string }) {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return null;
  const claimedAt = new Date();
  const claimed = await prisma.designChallenge.updateMany({
    where: { id, OR: [{ status: "OPEN" }, { status: "GRADING", submittedAt: { lt: new Date(Date.now() - STALE_GRADING_MS) } }] },
    data: { status: "GRADING", submittedAt: claimedAt },
  });
  if (claimed.count !== 1) return "alreadySubmitted" as const;

  try {
    // Re-read after the claim, so a hint revealed just before it is counted.
    const { hintsUsed } = await prisma.designChallenge.findUniqueOrThrow({ where: { id }, select: { hintsUsed: true } });
    const requirements = parseJsonObject<{ functional: string[]; nonFunctional: string[] }>(challenge.requirements);
    const grade = await generateValidated(
      gradePrompt({
        level: challenge.level,
        title: challenge.title,
        brief: challenge.brief,
        functional: requirements?.functional ?? [],
        nonFunctional: requirements?.nonFunctional ?? [],
        keyPoints: parseJsonArray<string>(challenge.keyPoints),
        diagram: submission.diagram,
        notes: submission.notes,
        hintsUsed,
      }),
      designGradeSchema
    );
    // Only the request holding this claim may write the result (a stale claim may have been retaken).
    await prisma.designChallenge.updateMany({
      where: { id, status: "GRADING", submittedAt: claimedAt },
      data: {
        status: "SUBMITTED",
        diagram: JSON.stringify(submission.diagram),
        notes: submission.notes,
        score: grade.score,
        feedback: JSON.stringify({ breakdown: grade.breakdown, strengths: grade.strengths, gaps: grade.gaps, feedback: grade.feedback, followUps: grade.followUps }),
        submittedAt: new Date(),
      },
    });
    return await prisma.designChallenge.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    await prisma.designChallenge.updateMany({ where: { id, status: "GRADING", submittedAt: claimedAt }, data: { status: "OPEN" } });
    throw err;
  }
}
