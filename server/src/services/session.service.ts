import { Difficulty, QuestionType, Track } from "../types";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { PriorQA } from "../ai/provider.interface";
import { analyzeFillers } from "./transcriptAnalysis";
import { visibleTopics } from "./topic.service";
import { Persona } from "../ai/personas";
import { applyEvidence, roleContextForSession } from "../roles/roles.service";
import { MOCK_ROUNDS, MockRound, roundGradingInstructions, roundQuestionInstructions } from "../roles/mock";

export function parseSkillTags(value: string): string[] {
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

export async function createSession(userId: string, topicId: string, track: Track, difficulty: Difficulty, persona: Persona = "NEUTRAL") {
  // Only preset topics or the user's own custom topics can be used.
  const topic = await prisma.topic.findFirst({ where: { id: topicId, ...visibleTopics(userId) } });
  if (!topic) return null;
  return prisma.interviewSession.create({
    data: { userId, topicId, track, difficulty, persona },
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
  if (session.status === "COMPLETED") return "completed" as const;

  const isMock = session.mode === "MOCK";
  if (isMock) {
    // One question at a time: hand back the open one instead of generating another (reloads, double clicks).
    const open = await prisma.question.findFirst({ where: { sessionId, answer: null }, orderBy: { order: "asc" } });
    if (open) return open;
    if (session.questions.length >= MOCK_ROUNDS.length) return null;
  }
  const order = session.questions.length + 1;
  const round: MockRound | null = isMock ? MOCK_ROUNDS[order - 1] : null;

  const priorQA = await loadPriorQA(sessionId);
  // A mock keeps its round structure even if its role was deleted mid-interview.
  const role =
    (await roleContextForSession(session.roleId, session.focusSkill)) ??
    (round ? { title: session.track, isTechnical: true, skills: [], focusSkill: null, jobDescription: null } : undefined);
  if (role && round) role.roundInstructions = roundQuestionInstructions(round, order, MOCK_ROUNDS.length, role.isTechnical);
  const generated = await retryOnInvalid(() =>
    aiProvider.generateQuestion({
    topic: session.topic.name,
    track: session.track,
    difficulty: session.difficulty as Difficulty,
      priorQA,
      role,
      persona: session.persona,
    })
  );

  // Keep only tags that name one of the role's skills, so evidence never lands on a skill that doesn't exist.
  const known = new Map((role?.skills ?? []).map((name) => [name.toLowerCase(), name]));
  const skillTags = (generated.skills ?? []).map((t) => known.get(t.trim().toLowerCase())).filter((t): t is string => !!t);
  // Code only where it makes sense: technical roles, and in a mock interview only the role-specific round.
  const type = (role && !role.isTechnical) || (round && round !== "ROLE") ? "VERBAL" : generated.type;

  const created = await prisma.question.create({
    data: {
      sessionId,
      text: generated.text,
      type,
      order,
      round,
      skillTags: JSON.stringify([...new Set(skillTags)]),
      codeSpec: type === "CODING" && generated.code ? JSON.stringify(generated.code) : null,
    },
  });
  // Two overlapping requests (double click, reload during generation) can both create question N. Keep the
  // first one and drop ours, so a session never gets duplicate or extra questions.
  const first = await prisma.question.findFirst({ where: { sessionId, order }, orderBy: [{ generatedAt: "asc" }, { id: "asc" }] });
  if (first && first.id !== created.id) {
    await prisma.question.delete({ where: { id: created.id } });
    return first;
  }
  return created;
}

export async function submitAnswer(
  questionId: string,
  userId: string,
  transcript: string,
  testResults: { language: string; passed: number; total: number } | null = null
) {
  const question = await prisma.question.findFirst({
    where: { id: questionId },
    include: { session: true },
  });
  if (!question || question.session.userId !== userId) throw new Error("Question not found");
  // A finished session (including one ended early) is frozen: its report is already written.
  if (question.session.status === "COMPLETED") return "completed" as const;

  // A double-click or retry must not pay for a second grading: reject before calling the AI.
  if (await prisma.answer.findUnique({ where: { questionId }, select: { id: true } })) return "answered" as const;

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
      roundInstructions: question.round ? roundGradingInstructions(question.round as MockRound) : undefined,
      persona: question.session.persona,
      testResults: question.type === "CODING" ? testResults : null,
    })
  );

  const answer = await prisma.answer.create({
    data: {
      questionId,
      transcript,
      fillerStats: fillerStats ? JSON.stringify(fillerStats) : null,
      testResults: question.type === "CODING" && testResults ? JSON.stringify(testResults) : null,
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

  // Skill ratings are a side effect: if updating them fails, the user still gets their graded answer. The closing
  // round grades the questions the candidate asks, not a skill, so it doesn't count as evidence.
  if (question.session.roleId && question.round !== "CLOSING") {
    await applyEvidence(question.session.roleId, parseSkillTags(question.skillTags), grading.score).catch((err) =>
      console.error("Couldn't update skill ratings:", err)
    );
  }

  return { answer, feedback: answer.feedback!, mode: question.session.mode };
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
