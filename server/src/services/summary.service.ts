import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { Difficulty } from "../types";
import { loadPriorQA } from "./session.service";

export async function endSession(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { topic: true },
  });
  if (!session) throw new Error("Session not found");

  const priorQA = await loadPriorQA(sessionId);

  const updated = await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", endedAt: new Date() },
    include: { topic: true },
  });

  if (priorQA.length === 0) {
    const summary = await prisma.sessionSummary.create({
      data: {
        sessionId,
        overallScore: 1,
        assessment: "No questions were answered in this session, so no meaningful assessment can be given.",
        strengths: JSON.stringify([]),
        improvements: JSON.stringify(["Answer at least one question to get feedback."]),
      },
    });
    return { session: updated, summary };
  }

  const result = await retryOnInvalid(() =>
    aiProvider.generateSummary({
      topic: session.topic.name,
      track: session.track,
      difficulty: session.difficulty as Difficulty,
      priorQA,
    })
  );

  const summary = await prisma.sessionSummary.create({
    data: {
      sessionId,
      overallScore: result.overallScore,
      assessment: result.assessment,
      strengths: JSON.stringify(result.strengths),
      improvements: JSON.stringify(result.improvements),
    },
  });

  return { session: updated, summary };
}

export async function getSummary(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return null;
  const summary = await prisma.sessionSummary.findUnique({ where: { sessionId } });
  return { session, summary };
}
