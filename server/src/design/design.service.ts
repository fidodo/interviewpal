import { answerVisible, attemptInfo, attemptsLeft, nextAttempt, previousForPrompt } from "../utils/attempts";
import { prisma } from "../db/prisma";
import { pickDesign } from "../pool/serve";
import { scoreDesign } from "./design.rubric";
import { generateValidated } from "../ai/retry";
import { parseJsonArray, parseJsonObject } from "../utils/json";
import { challengePrompt, challengeSchema, designGradeSchema, Diagram, gradePrompt } from "./design.prompts";

const RECENT = 10;
const STALE_GRADING_MS = 2 * 60 * 1000;

export interface WrittenDesign {
  level: string;
  title: string;
  brief: string;
  requirements: string;
  hints: string;
  keyPoints: string;
  referenceDesign: string;
}

// Writes one design question with the AI, checked by the schema, without saving it. Used for a user's own question
// and, with no user context, by the question pool's update (pool/fill.ts).
export async function writeChallenge(p: {
  level: string;
  topic: string | null;
  roleTitle: string | null;
  recentTitles: string[];
  trends?: string[];
}): Promise<WrittenDesign> {
  const generated = await generateValidated(challengePrompt(p), challengeSchema);
  return {
    level: p.level,
    title: generated.title,
    brief: generated.brief,
    requirements: JSON.stringify({ functional: generated.functional, nonFunctional: generated.nonFunctional }),
    hints: JSON.stringify(generated.hints),
    keyPoints: JSON.stringify(generated.keyPoints),
    referenceDesign: generated.referenceDesign,
  };
}

export async function createChallenge(userId: string, level: string, topic: string | null) {
  // Without a topic, a question comes from the shared pool when it's switched on and has one this user hasn't had.
  // A typed topic has no reliable match in the pool, so it's always written by the AI.
  const pooled = topic ? null : await pickDesign({ userId, level });
  if (pooled) return prisma.designChallenge.create({ data: { userId, ...pooled.payload, level, poolItemId: pooled.id } });
  const [role, recent] = await Promise.all([
    prisma.targetRole.findFirst({ where: { userId, isActive: true }, select: { title: true } }),
    prisma.designChallenge.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: RECENT, select: { title: true } }),
  ]);
  const written = await writeChallenge({ level, topic, roleTitle: role?.title ?? null, recentTitles: recent.map((r) => r.title) });
  return prisma.designChallenge.create({ data: { userId, ...written } });
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
    const latest = await prisma.designChallenge.findUniqueOrThrow({ where: { id }, select: { hintsUsed: true, feedback: true, score: true } });
    const hintsUsed = latest.hintsUsed;
    // A resubmission follows the attempt marked before it (utils/attempts.ts).
    const previousFeedback = parseJsonObject<{ toImprove?: unknown }>(latest.feedback);
    const previous = attemptInfo(previousFeedback);
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
        previous: previous ? previousForPrompt(latest.score, previousFeedback?.toImprove) : undefined,
      }),
      designGradeSchema
    );
    const common = { strengths: grade.strengths, gaps: grade.gaps, feedback: grade.feedback, followUps: grade.followUps, ...nextAttempt(previous, latest.score) };
    // Points marking: the hint deduction, total and step points come from design.rubric.ts. A reply in the older
    // shape is stored the old way.
    const marked =
      grade.kind === "points"
        ? (() => {
            const { parts, score, toImprove } = scoreDesign(grade.raw, hintsUsed, grade.steps);
            return { score, feedback: { ...common, parts, reasons: grade.reasons, toImprove } };
          })()
        : { score: grade.score, feedback: { ...common, breakdown: grade.breakdown } };
    // Only the request holding this claim may write the result (a stale claim may have been retaken).
    await prisma.designChallenge.updateMany({
      where: { id, status: "GRADING", submittedAt: claimedAt },
      data: {
        status: "SUBMITTED",
        diagram: JSON.stringify(submission.diagram),
        notes: submission.notes,
        score: marked.score,
        feedback: JSON.stringify(marked.feedback),
        submittedAt: new Date(),
      },
    });
    return await prisma.designChallenge.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    await prisma.designChallenge.updateMany({ where: { id, status: "GRADING", submittedAt: claimedAt }, data: { status: "OPEN" } });
    throw err;
  }
}

type ImproveOutcome = { challenge: Challenge } | { error: "notFound" | "answerShown" | "noAttemptsLeft" | "notMarked" | "changed" };
type Challenge = NonNullable<Awaited<ReturnType<typeof findChallenge>>>;

// "Improve and resubmit", as in debug practice: a marked design whose model answer hasn't been shown goes back to
// OPEN with its mark kept. Conditional on the feedback read here, so it can't race "Show me the model answer".
export async function improve(userId: string, id: string): Promise<ImproveOutcome> {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return { error: "notFound" };
  if (challenge.status !== "SUBMITTED" || challenge.feedback == null) return { error: "notMarked" };
  const info = attemptInfo(parseJsonObject(challenge.feedback));
  if (answerVisible(info)) return { error: "answerShown" };
  if (attemptsLeft(info) === 0) return { error: "noAttemptsLeft" };
  const moved = await prisma.designChallenge.updateMany({
    where: { id, userId, status: "SUBMITTED", feedback: challenge.feedback },
    data: { status: "OPEN" },
  });
  if (moved.count !== 1) return { error: "changed" };
  return { challenge: await prisma.designChallenge.findUniqueOrThrow({ where: { id } }) };
}

// "Show me the model answer" after a mark: ends resubmitting. While improving it goes back to the last mark.
export async function showAnswer(userId: string, id: string): Promise<Challenge | null> {
  const challenge = await findChallenge(userId, id);
  if (!challenge) return null;
  const feedback = parseJsonObject<Record<string, unknown>>(challenge.feedback);
  const info = attemptInfo(feedback);
  if (!info || info.answerShown || !(challenge.status === "SUBMITTED" || challenge.status === "OPEN")) return challenge;
  await prisma.designChallenge.updateMany({
    where: { id, userId, status: challenge.status, feedback: challenge.feedback },
    data: { status: "SUBMITTED", feedback: JSON.stringify({ ...feedback, answerShown: true }) },
  });
  return prisma.designChallenge.findUniqueOrThrow({ where: { id } });
}
