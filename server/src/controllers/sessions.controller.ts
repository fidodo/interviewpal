import { Response } from "express";
import { z } from "zod";
import { Difficulty } from "../types";
import { AuthedRequest } from "../middleware/auth.middleware";
import * as sessionService from "../services/session.service";
import * as summaryService from "../services/summary.service";

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function serializeFeedback(feedback: { score: number; strengths: string; weaknesses: string; suggestions: string } | null | undefined) {
  if (!feedback) return null;
  return {
    score: feedback.score,
    strengths: parseJsonArray(feedback.strengths),
    weaknesses: parseJsonArray(feedback.weaknesses),
    suggestions: parseJsonArray(feedback.suggestions),
  };
}

function serializeSummary(summary: { overallScore: number; assessment: string; strengths: string; improvements: string } | null | undefined) {
  if (!summary) return null;
  return {
    overallScore: summary.overallScore,
    assessment: summary.assessment,
    strengths: parseJsonArray(summary.strengths),
    improvements: parseJsonArray(summary.improvements),
  };
}

const createSessionSchema = z.object({
  topicId: z.string().min(1),
  track: z.string().min(1).max(60),
  difficulty: z.nativeEnum(Difficulty),
});

export async function createSession(req: AuthedRequest, res: Response) {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session request" });
    return;
  }
  const { topicId, track, difficulty } = parsed.data;
  const session = await sessionService.createSession(req.userId!, topicId, track, difficulty);
  res.status(201).json({ session });
}

export async function generateNextQuestion(req: AuthedRequest, res: Response) {
  const question = await sessionService.generateNextQuestion(req.params.id, req.userId!);
  res.status(201).json({ question });
}

const submitAnswerSchema = z.object({
  transcript: z.string().min(1),
});

export async function submitAnswer(req: AuthedRequest, res: Response) {
  const parsed = submitAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Transcript is required" });
    return;
  }
  const { answer, feedback } = await sessionService.submitAnswer(req.params.id, req.userId!, parsed.data.transcript);
  res.status(201).json({
    answer: { id: answer.id, transcript: answer.transcript, submittedAt: answer.submittedAt },
    feedback: serializeFeedback(feedback),
  });
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
  res.json({ session: result.session, summary: serializeSummary(result.summary) });
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
  res.json({
    session: {
      id: session.id,
      topic: session.topic,
      track: session.track,
      difficulty: session.difficulty,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      questions: session.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        order: q.order,
        answer: q.answer
          ? {
              id: q.answer.id,
              transcript: q.answer.transcript,
              feedback: serializeFeedback(q.answer.feedback),
            }
          : null,
      })),
    },
  });
}
