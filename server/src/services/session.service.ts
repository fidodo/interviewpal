import { Difficulty, QuestionType, Track } from "../types";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { PriorQA } from "../ai/provider.interface";

async function loadPriorQA(sessionId: string): Promise<PriorQA[]> {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { order: "asc" },
    include: { answer: { include: { feedback: true } } },
  });
  return questions
    .filter((q) => q.answer)
    .map((q) => ({
      question: q.text,
      answer: q.answer!.transcript,
      score: q.answer!.feedback?.score,
      questionType: q.type as QuestionType,
    }));
}

export async function createSession(userId: string, topicId: string, track: Track, difficulty: Difficulty) {
  return prisma.interviewSession.create({
    data: { userId, topicId, track, difficulty },
    include: { topic: true },
  });
}

export async function getSession(sessionId: string, userId: string) {
  return prisma.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { topic: true, questions: { orderBy: { order: "asc" }, include: { answer: { include: { feedback: true } } } } },
  });
}

export async function generateNextQuestion(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { topic: true, questions: true },
  });
  if (!session) throw new Error("Session not found");

  const priorQA = await loadPriorQA(sessionId);
  const generated = await aiProvider.generateQuestion({
    topic: session.topic.name,
    track: session.track,
    difficulty: session.difficulty as Difficulty,
    priorQA,
  });

  const order = session.questions.length + 1;
  return prisma.question.create({
    data: { sessionId, text: generated.text, type: generated.type, order },
  });
}

export async function submitAnswer(questionId: string, userId: string, transcript: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId },
    include: { session: true },
  });
  if (!question || question.session.userId !== userId) throw new Error("Question not found");

  const answer = await prisma.answer.create({
    data: { questionId, transcript },
  });

  const grading = await aiProvider.gradeAnswer({
    question: question.text,
    transcript,
    difficulty: question.session.difficulty as Difficulty,
    questionType: question.type as QuestionType,
  });

  const feedback = await prisma.feedback.create({
    data: {
      answerId: answer.id,
      score: grading.score,
      strengths: JSON.stringify(grading.strengths),
      weaknesses: JSON.stringify(grading.weaknesses),
      suggestions: JSON.stringify(grading.suggestions),
    },
  });

  return { answer, feedback };
}

export async function listSessions(userId: string) {
  return prisma.interviewSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: { topic: true, summary: true },
  });
}

export { loadPriorQA };
