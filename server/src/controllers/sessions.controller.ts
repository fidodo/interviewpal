import { Response } from "express";
import { z } from "zod";
import { Difficulty } from "../types";
import { AuthedRequest } from "../middleware/auth.middleware";
import * as sessionService from "../services/session.service";
import * as summaryService from "../services/summary.service";
import { MOCK_PLAN, StoryNote } from "../roles/mock";
import { PERSONA_KEYS } from "../ai/personas";
import { CodeSpec } from "../ai/provider.interface";
import { parseJsonObject } from "../utils/json";
import { recordPractice } from "../today/practice.service";

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

interface FeedbackRow {
  score: number;
  correctnessScore: number | null;
  clarityScore: number | null;
  depthScore: number | null;
  strengths: string;
  weaknesses: string;
  suggestions: string;
}

function serializeFeedback(feedback: FeedbackRow | null | undefined) {
  if (!feedback) return null;
  const hasBreakdown = feedback.correctnessScore != null && feedback.clarityScore != null && feedback.depthScore != null;
  return {
    score: feedback.score,
    breakdown: hasBreakdown
      ? { correctness: feedback.correctnessScore, clarity: feedback.clarityScore, depth: feedback.depthScore }
      : null,
    strengths: parseJsonArray(feedback.strengths),
    weaknesses: parseJsonArray(feedback.weaknesses),
    suggestions: parseJsonArray(feedback.suggestions),
  };
}

function serializeFillerStats(fillerStats: string | null | undefined) {
  if (!fillerStats) return null;
  try {
    return JSON.parse(fillerStats);
  } catch {
    return null;
  }
}

function parseCodeSpec(value: string | null) {
  return parseJsonObject<CodeSpec>(value);
}

function parseRoundScores(value: string | null): { round: string; score: number }[] | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeSummary(
  summary:
    | { overallScore: number; assessment: string; strengths: string; improvements: string; verdict: string | null; roundScores: string | null; storyNotes?: string | null }
    | null
    | undefined
) {
  if (!summary) return null;
  return {
    overallScore: summary.overallScore,
    assessment: summary.assessment,
    strengths: parseJsonArray(summary.strengths),
    improvements: parseJsonArray(summary.improvements),
    verdict: summary.verdict,
    roundScores: parseRoundScores(summary.roundScores),
    storyNotes: parseJsonObject<StoryNote[]>(summary.storyNotes ?? null),
  };
}

const createSessionSchema = z.object({
  topicId: z.string().min(1),
  track: z.string().min(1).max(60),
  difficulty: z.nativeEnum(Difficulty),
  persona: z.enum(PERSONA_KEYS).default("NEUTRAL"),
});

export async function createSession(req: AuthedRequest, res: Response) {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session request" });
    return;
  }
  const { topicId, track, difficulty, persona } = parsed.data;
  const session = await sessionService.createSession(req.userId!, topicId, track, difficulty, persona);
  if (!session) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  res.status(201).json({ session });
}

function serializeQuestion(question: { id: string; text: string; type: string; order: number; round: string | null; codeSpec: string | null; followUpOf: string | null }) {
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    order: question.order,
    round: question.round,
    codeSpec: parseCodeSpec(question.codeSpec),
    followUpOf: question.followUpOf,
  };
}

function serializeRetake(r: { number: number; transcript: string; fillerStats: string | null; testResults: string | null; score: number; feedback: string; createdAt: Date }) {
  const feedback = sessionService.retakeFeedback(r.feedback);
  return {
    number: r.number,
    transcript: r.transcript,
    fillerStats: serializeFillerStats(r.fillerStats),
    testResults: serializeFillerStats(r.testResults),
    createdAt: r.createdAt,
    feedback: { score: r.score, ...feedback },
  };
}

export async function generateNextQuestion(req: AuthedRequest, res: Response) {
  const question = await sessionService.generateNextQuestion(req.params.id, req.userId!);
  if (question === "completed") {
    res.status(409).json({ error: "This interview has finished." });
    return;
  }
  if (!question) {
    res.status(409).json({ error: "That was the last question. Finish the interview to see your report." });
    return;
  }
  res.status(201).json({ question: serializeQuestion(question) });
}

export async function generateFollowUp(req: AuthedRequest, res: Response) {
  const question = await sessionService.generateFollowUp(req.params.id, req.userId!);
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  if (question === "completed" || question === "notAllowed") {
    res.status(409).json({ error: question === "completed" ? "This interview has finished." : "A follow-up can only be asked on an answered question in a practice session." });
    return;
  }
  res.status(201).json({ question: serializeQuestion(question) });
}

const submitAnswerSchema = z.object({
  transcript: z.string().min(1).max(20000),
  testResults: z
    .object({ language: z.enum(["python", "javascript"]), passed: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) })
    .refine((r) => r.passed <= r.total)
    .nullish(),
});

export async function submitAnswer(req: AuthedRequest, res: Response) {
  const parsed = submitAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Answer is required and must be under 20,000 characters" });
    return;
  }
  const result = await sessionService.submitAnswer(req.params.id, req.userId!, parsed.data.transcript, parsed.data.testResults ?? null);
  if (result === "answered" || result === "completed") {
    res.status(409).json({ error: result === "answered" ? "This question has already been answered." : "This interview has finished." });
    return;
  }
  const { answer, feedback, mode } = result;
  // A running mock hides the score, so it can't be celebrated as a personal best yet.
  const rewards = await recordPractice(req.userId!, "ANSWER", mode === "MOCK" ? null : feedback.score);
  res.status(201).json({
    answer: {
      id: answer.id,
      transcript: answer.transcript,
      submittedAt: answer.submittedAt,
      fillerStats: serializeFillerStats(answer.fillerStats),
    },
    // Mock interviews hold all feedback until the report, like a real interview.
    feedback: mode === "MOCK" ? null : serializeFeedback(feedback),
    rewards,
  });
}

const RETAKE_ERRORS = {
  notAnswered: "Answer the question first, then you can retake it.",
  mockRunning: "Retakes open when the mock interview has finished.",
  limit: `You've retaken this answer ${sessionService.MAX_RETAKES} times. Try a new question instead.`,
  busy: "Your last retake is still being graded.",
} as const;

export async function submitRetake(req: AuthedRequest, res: Response) {
  const parsed = submitAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Answer is required and must be under 20,000 characters" });
    return;
  }
  const result = await sessionService.submitRetake(req.params.id, req.userId!, parsed.data.transcript, parsed.data.testResults ?? null);
  if (!result) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  if (typeof result === "string") {
    res.status(409).json({ error: RETAKE_ERRORS[result] });
    return;
  }
  res.status(201).json({ retake: serializeRetake(result), rewards: await recordPractice(req.userId!, "RETAKE", result.score) });
}

export async function endSession(req: AuthedRequest, res: Response) {
  const { session, summary } = await summaryService.endSession(req.params.id, req.userId!);
  res.json({ session, summary: serializeSummary(summary) });
}

export async function getSummary(req: AuthedRequest, res: Response) {
  const result = await summaryService.getSummary(req.params.id, req.userId!);
  if (!result || !result.summary) {
    res.status(404).json({ error: "Summary not found" });
    return;
  }
  res.json({ session: result.session, summary: serializeSummary(result.summary), skillsTested: result.skillsTested });
}

export async function deleteSession(req: AuthedRequest, res: Response) {
  await sessionService.deleteSession(req.params.id, req.userId!);
  res.status(204).send();
}

export async function listSessions(req: AuthedRequest, res: Response) {
  const sessions = await sessionService.listSessions(req.userId!);
  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      topic: s.topic,
      track: s.track,
      difficulty: s.difficulty,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      summary: s.summary ? { overallScore: s.summary.overallScore } : null,
    })),
  });
}

export async function getSessionDetail(req: AuthedRequest, res: Response) {
  const session = await sessionService.getSession(req.params.id, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const hideFeedback = session.mode === "MOCK" && session.status !== "COMPLETED";
  res.json({
    session: {
      id: session.id,
      topic: session.topic,
      track: session.track,
      difficulty: session.difficulty,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      mode: session.mode,
      persona: session.persona,
      plannedRounds: session.mode === "MOCK" ? MOCK_PLAN.length : null,
      questions: session.questions.map((q) => ({
        ...serializeQuestion(q),
        answer: q.answer
          ? {
              id: q.answer.id,
              transcript: q.answer.transcript,
              fillerStats: serializeFillerStats(q.answer.fillerStats),
              // Hidden while a mock interview is still running.
              feedback: hideFeedback ? null : serializeFeedback(q.answer.feedback),
              retakes: hideFeedback ? [] : q.answer.retakes.map(serializeRetake),
            }
          : null,
      })),
    },
  });
}
