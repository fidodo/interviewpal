import { Difficulty, QuestionType, Track } from "../types";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { PriorQA } from "../ai/provider.interface";
import { analyzeFillers } from "./transcriptAnalysis";
import { visibleTopics } from "./topic.service";
import { applyEvidence, roleContextForSession } from "../roles/roles.service";

function parseSkillTags(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

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
  // Only preset topics or the user's own custom topics can be used.
  const topic = await prisma.topic.findFirst({ where: { id: topicId, ...visibleTopics(userId) } });
  if (!topic) return null;
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
  const role = await roleContextForSession(session.roleId, session.focusSkill);
  const generated = await retryOnInvalid(() =>
    aiProvider.generateQuestion({
    topic: session.topic.name,
    track: session.track,
    difficulty: session.difficulty as Difficulty,
      priorQA,
      role,
    })
  );

  // Keep only tags that name one of the role's skills, so evidence never lands on a skill that doesn't exist.
  const known = new Map((role?.skills ?? []).map((name) => [name.toLowerCase(), name]));
  const skillTags = (generated.skills ?? []).map((t) => known.get(t.trim().toLowerCase())).filter((t): t is string => !!t);
  const type = role && !role.isTechnical ? "VERBAL" : generated.type;

  const order = session.questions.length + 1;
  return prisma.question.create({
    data: { sessionId, text: generated.text, type, order, skillTags: JSON.stringify([...new Set(skillTags)]) },
  });
}

export async function submitAnswer(questionId: string, userId: string, transcript: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId },
    include: { session: true },
  });
  if (!question || question.session.userId !== userId) throw new Error("Question not found");

  // A double-click or retry must not pay for a second grading: reject before calling the AI.
  if (await prisma.answer.findUnique({ where: { questionId }, select: { id: true } })) return null;

  const questionType = question.type as QuestionType;
  const fillerStats = questionType === "VERBAL" ? analyzeFillers(transcript) : null;

  // Grade first, then save the answer and its feedback in one transaction, so a failure anywhere leaves nothing
  // behind and the user can simply submit again.
  const grading = await retryOnInvalid(() =>
    aiProvider.gradeAnswer({
      question: question.text,
      transcript,
      difficulty: question.session.difficulty as Difficulty,
      questionType,
    })
  );

  const answer = await prisma.answer.create({
    data: {
      questionId,
      transcript,
      fillerStats: fillerStats ? JSON.stringify(fillerStats) : null,
      feedback: {
        create: {
          score: grading.score,
          correctnessScore: grading.breakdown.correctness,
          clarityScore: grading.breakdown.clarity,
          depthScore: grading.breakdown.depth,
          strengths: JSON.stringify(grading.strengths),
          weaknesses: JSON.stringify(grading.weaknesses),
          suggestions: JSON.stringify(grading.suggestions),
        },
      },
    },
    include: { feedback: true },
  });

  // Skill ratings are a side effect: if updating them fails, the user still gets their graded answer.
  if (question.session.roleId) {
    await applyEvidence(question.session.roleId, parseSkillTags(question.skillTags), grading.score).catch((err) =>
      console.error("Couldn't update skill ratings:", err)
    );
  }

  return { answer, feedback: answer.feedback! };
}

export async function listSessions(userId: string) {
  return prisma.interviewSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: { topic: true, summary: true },
  });
}

export async function deleteSession(sessionId: string, userId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new Error("Session not found");
  await prisma.interviewSession.delete({ where: { id: sessionId } });
}

export { loadPriorQA };
