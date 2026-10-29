import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { Difficulty } from "../types";
import { loadPriorQA, parseSkillTags } from "./session.service";
import { buildMockReport } from "../roles/mock";

// Builds the summary first and only then marks the session completed, so a failed AI call leaves the session
// open to try again instead of "completed" with no report. Ending twice returns the existing summary.
export async function endSession(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { topic: true, role: { select: { title: true, level: true } } },
  });
  if (!session) throw new Error("Session not found");

  const summary = (await prisma.sessionSummary.findUnique({ where: { sessionId } })) ?? (await createSummary(session));

  const updated = await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", endedAt: session.endedAt ?? new Date() },
    include: { topic: true },
  });
  return { session: updated, summary };
}

// Two overlapping /end calls (double click, client retry) can both get here; the loser of the unique insert
// returns the winner's summary instead of failing.
async function createSummary(session: Parameters<typeof buildSummary>[0]) {
  const data = await buildSummary(session);
  try {
    return await prisma.sessionSummary.create({ data: { sessionId: session.id, ...data } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.sessionSummary.findUniqueOrThrow({ where: { sessionId: session.id } });
    }
    throw err;
  }
}

async function buildSummary(session: {
  id: string;
  mode: string;
  track: string;
  difficulty: string;
  topic: { name: string };
  role: { title: string; level: string } | null;
}) {
  const priorQA = await loadPriorQA(session.id);
  if (priorQA.length === 0) {
    return {
      overallScore: 1,
      assessment: "No questions were answered in this session, so no meaningful assessment can be given.",
      strengths: JSON.stringify([]),
      improvements: JSON.stringify(["Answer at least one question to get feedback."]),
    };
  }

  if (session.mode === "MOCK") {
    const report = await buildMockReport(session.id, session.role ?? { title: session.track, level: session.difficulty });
    if (report) {
      return {
        overallScore: report.overallScore,
        assessment: report.assessment,
        strengths: JSON.stringify(report.strengths),
        improvements: JSON.stringify(report.improvements),
        verdict: report.verdict,
        roundScores: JSON.stringify(report.roundScores),
      };
    }
  }

  const result = await retryOnInvalid(() =>
    aiProvider.generateSummary({
      topic: session.topic.name,
      track: session.track,
      difficulty: session.difficulty as Difficulty,
      priorQA,
    })
  );
  return {
    overallScore: result.overallScore,
    assessment: result.assessment,
    strengths: JSON.stringify(result.strengths),
    improvements: JSON.stringify(result.improvements),
  };
}

export async function getSummary(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, userId }, include: { questions: { select: { skillTags: true } } } });
  if (!session) return null;
  const summary = await prisma.sessionSummary.findUnique({ where: { sessionId } });

  // For role sessions: the skills this session tested and where their ratings stand now.
  const tags = new Set(session.questions.flatMap((q) => parseSkillTags(q.skillTags)));
  const skillsTested =
    session.roleId && tags.size
      ? (
          await prisma.roleSkill.findMany({ where: { roleId: session.roleId, name: { in: [...tags] } }, select: { name: true, rating: true } })
        ).map((s) => ({ name: s.name, rating: s.rating }))
      : [];
  const { questions: _questions, ...rest } = session;
  return { session: rest, summary, skillsTested };
}


