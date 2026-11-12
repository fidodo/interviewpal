import { Difficulty, QuestionType, Track } from "../types";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { PriorQA } from "../ai/provider.interface";
import { analyzeFillers } from "./transcriptAnalysis";
import { visibleTopics } from "./topic.service";
import { Persona } from "../ai/personas";
import { applyEvidence, roleContextForSession } from "../roles/roles.service";
import { MOCK_PLAN, MockRound, roundGradingInstructions, roundQuestionInstructions } from "../roles/mock";
import { parseJsonArray } from "../utils/json";
import { isUniqueViolation } from "../utils/prismaErrors";

// A question's skill tags (a JSON array of skill names).
export const parseSkillTags = (value: string) => parseJsonArray<string>(value);

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
    include: {
      topic: true,
      questions: { orderBy: { order: "asc" }, include: { answer: { include: { feedback: true, retakes: { orderBy: { number: "asc" } } } } } },
    },
  });
}

type SessionWithQuestions = NonNullable<Awaited<ReturnType<typeof loadSessionWithQuestions>>>;

function loadSessionWithQuestions(sessionId: string, userId: string) {
  return prisma.interviewSession.findFirst({ where: { id: sessionId, userId }, include: { topic: true, questions: true } });
}

export async function generateNextQuestion(sessionId: string, userId: string) {
  const session = await loadSessionWithQuestions(sessionId, userId);
  if (!session) throw new Error("Session not found");
  if (session.status === "COMPLETED") return "completed" as const;

  if (session.mode === "MOCK") {
    // One question at a time: hand back the open one instead of generating another (reloads, double clicks).
    const open = await prisma.question.findFirst({ where: { sessionId, answer: null }, orderBy: { order: "asc" } });
    if (open) return open;
    const step = MOCK_PLAN[session.questions.length];
    if (!step) return null;
    // A follow-up presses on the answer just given.
    const parent = step.followUp ? session.questions.find((q) => q.order === session.questions.length) : undefined;
    return createQuestion(session, step.round, parent);
  }
  return createQuestion(session, null);
}

// Practice sessions: one follow-up on an answered question, asked as the next question. Asking twice returns the
// same follow-up, and a follow-up can't itself be followed up.
export async function generateFollowUp(questionId: string, userId: string) {
  const parent = await prisma.question.findFirst({
    where: { id: questionId, session: { userId } },
    include: { answer: { select: { id: true } } },
  });
  if (!parent) return null;
  const session = await loadSessionWithQuestions(parent.sessionId, userId);
  if (!session) return null;
  if (session.status === "COMPLETED") return "completed" as const;
  if (session.mode === "MOCK" || parent.followUpOf || !parent.answer) return "notAllowed" as const;
  const existing = session.questions.find((q) => q.followUpOf === parent.id);
  if (existing) return existing;
  return createQuestion(session, null, parent);
}

async function createQuestion(session: SessionWithQuestions, round: MockRound | null, followUpOf?: { id: string; text: string; skillTags: string }) {
  const sessionId = session.id;
  const order = session.questions.length + 1;
  const priorQA = await loadPriorQA(sessionId);
  const parentAnswer = followUpOf ? await prisma.answer.findUnique({ where: { questionId: followUpOf.id }, select: { transcript: true } }) : null;
  const followUp = followUpOf && parentAnswer ? { question: followUpOf.text, answer: parentAnswer.transcript } : undefined;

  // A mock keeps its round structure even if its role was deleted mid-interview.
  const role =
    (await roleContextForSession(session.roleId, session.focusSkill)) ??
    (round ? { title: session.track, isTechnical: true, skills: [], focusSkill: null, jobDescription: null } : undefined);
  // A follow-up's own instructions replace the round's "ask a new question" ones.
  if (role && round && !followUp) role.roundInstructions = roundQuestionInstructions(round, order, MOCK_PLAN.length, role.isTechnical);
  const generated = await retryOnInvalid(() =>
    aiProvider.generateQuestion({
      topic: session.topic.name,
      track: session.track,
      difficulty: session.difficulty as Difficulty,
      priorQA,
      role,
      persona: session.persona,
      followUp,
    })
  );

  // Keep only tags that name one of the role's skills, so evidence never lands on a skill that doesn't exist. A
  // follow-up tests the same skills as its question.
  const known = new Map((role?.skills ?? []).map((name) => [name.toLowerCase(), name]));
  const skillTags = followUp
    ? parseSkillTags(followUpOf!.skillTags)
    : (generated.skills ?? []).map((t) => known.get(t.trim().toLowerCase())).filter((t): t is string => !!t);
  // Code only where it makes sense: technical roles, and in a mock interview only the role-specific round. A
  // follow-up is a spoken conversation.
  const type = followUp || (role && !role.isTechnical) || (round && round !== "ROLE") ? "VERBAL" : generated.type;

  const created = await prisma.question.create({
    data: {
      sessionId,
      text: generated.text,
      type,
      order,
      round,
      skillTags: JSON.stringify([...new Set(skillTags)]),
      codeSpec: type === "CODING" && generated.code ? JSON.stringify(generated.code) : null,
      followUpOf: followUp ? followUpOf!.id : null,
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

  let answer;
  try {
    answer = await prisma.answer.create({
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
  } catch (err) {
    // Another submit of the same question was saved first (a double click): one answer per question.
    if (isUniqueViolation(err)) return "answered" as const;
    throw err;
  }

  // Skill ratings are a side effect: if updating them fails, the user still gets their graded answer. The closing
  // round grades the questions the candidate asks, not a skill, so it doesn't count as evidence.
  if (question.session.roleId && question.round !== "CLOSING") {
    await applyEvidence(question.session.roleId, parseSkillTags(question.skillTags), grading.score).catch((err) =>
      console.error("Couldn't update skill ratings:", err)
    );
  }

  return { answer, feedback: answer.feedback!, mode: question.session.mode };
}

export const MAX_RETAKES = 3;
const STALE_RETAKE_MS = 2 * 60 * 1000;

const parseList = (value: string) => parseJsonArray<unknown>(value).map(String);

export interface RetakeFeedback {
  breakdown: { correctness: number; clarity: number; depth: number } | null;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export function retakeFeedback(value: string): RetakeFeedback {
  try {
    const parsed = JSON.parse(value) as Partial<RetakeFeedback>;
    return {
      breakdown: parsed.breakdown ?? null,
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return { breakdown: null, strengths: [], weaknesses: [], suggestions: [] };
  }
}

// Answer a question again for practice. The original answer, its feedback, the session summary and skill ratings
// never change; a retake is graded against the previous attempt so the feedback can say what improved.
export async function submitRetake(
  questionId: string,
  userId: string,
  transcript: string,
  testResults: { language: string; passed: number; total: number } | null = null
) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, session: { userId } },
    include: { session: true, answer: { include: { feedback: true, retakes: { orderBy: { number: "asc" } } } } },
  });
  if (!question) return null;
  const answer = question.answer;
  if (!answer?.feedback) return "notAnswered" as const;
  // A running mock interview hides feedback, so retakes wait until its report.
  if (question.session.mode === "MOCK" && question.session.status !== "COMPLETED") return "mockRunning" as const;
  if (answer.retakes.length >= MAX_RETAKES) return "limit" as const;

  // Claim the answer before paying for a grading, so a double submit is refused. A claim older than 2 minutes
  // (a crashed request) can be retaken.
  const claimedAt = new Date();
  const claimed = await prisma.answer.updateMany({
    where: { id: answer.id, OR: [{ retakeGradingAt: null }, { retakeGradingAt: { lt: new Date(Date.now() - STALE_RETAKE_MS) } }] },
    data: { retakeGradingAt: claimedAt },
  });
  if (claimed.count !== 1) return "busy" as const;

  try {
    const last = answer.retakes[answer.retakes.length - 1];
    const previousAttempt = last
      ? { score: last.score, weaknesses: retakeFeedback(last.feedback).weaknesses }
      : { score: answer.feedback.score, weaknesses: parseList(answer.feedback.weaknesses) };
    const questionType = question.type as QuestionType;
    const fillerStats = questionType === "VERBAL" ? analyzeFillers(transcript) : null;
    const grading = await retryOnInvalid(() =>
      aiProvider.gradeAnswer({
        question: question.text,
        transcript,
        difficulty: question.session.difficulty as Difficulty,
        questionType,
        roundInstructions: question.round ? roundGradingInstructions(question.round as MockRound) : undefined,
        persona: question.session.persona,
        testResults: questionType === "CODING" ? testResults : null,
        previousAttempt,
      })
    );
    // @@unique([answerId, number]) backs up the claim.
    return await prisma.answerRetake.create({
      data: {
        answerId: answer.id,
        number: answer.retakes.length + 1,
        transcript,
        fillerStats: fillerStats ? JSON.stringify(fillerStats) : null,
        testResults: questionType === "CODING" && testResults ? JSON.stringify(testResults) : null,
        score: grading.score,
        feedback: JSON.stringify({
          breakdown: grading.breakdown,
          strengths: grading.strengths,
          weaknesses: grading.weaknesses,
          suggestions: grading.suggestions,
        }),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "busy" as const;
    throw err;
  } finally {
    await prisma.answer.updateMany({ where: { id: answer.id, retakeGradingAt: claimedAt }, data: { retakeGradingAt: null } });
  }
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
