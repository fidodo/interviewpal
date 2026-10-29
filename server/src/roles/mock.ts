import { z } from "zod";
import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { levelLabel } from "./roles.prompts";

// A full mock interview (Phase 3 of docs/roadmap.md): a fixed run of rounds, no feedback until the end, then a
// hiring verdict. Questions, grading and skill evidence reuse the normal session flow.
export const MOCK_ROUNDS = ["BEHAVIOURAL", "BEHAVIOURAL", "ROLE", "ROLE", "CLOSING"] as const;
export type MockRound = (typeof MOCK_ROUNDS)[number];

export const ROUND_LABELS: Record<MockRound, string> = {
  BEHAVIOURAL: "Behavioural",
  ROLE: "Role-specific",
  CLOSING: "Your questions for us",
};

// Extra instructions for the question prompt.
export function roundQuestionInstructions(round: MockRound, index: number, total: number, isTechnical: boolean): string {
  const position = `This is a realistic mock interview: question ${index} of ${total}. Sound like a real interviewer and don't give feedback or hints.`;
  switch (round) {
    case "BEHAVIOURAL":
      return `${position} Ask a behavioural question ("Tell me about a time when...") about a situation this role faces, so the candidate answers with a real example (Situation, Task, Action, Result). Use type "VERBAL".`;
    case "ROLE":
      return `${position} Ask a role-specific question that tests the core skills of the job${
        isTechnical ? ` (technical: a design, debugging, or short coding problem is fine; use "CODING" only if they should write code)` : `; use type "VERBAL"`
      }.`;
    case "CLOSING":
      return `${position} This is the last part. Wrap up naturally and invite the candidate to ask you their questions about the role, team or company, as a real interviewer would at the end. Use type "VERBAL" and return "skills" as an empty list.`;
  }
}

// Extra instructions for the grading prompt.
export function roundGradingInstructions(round: MockRound): string {
  switch (round) {
    case "BEHAVIOURAL":
      return `This is a behavioural question. Judge whether they used a specific real example with a clear situation, task, the actions THEY took, and a concrete result or lesson. Vague or hypothetical answers score lower.`;
    case "ROLE":
      return `This is the role-specific round. Judge the substance against what the job needs.`;
    case "CLOSING":
      return `The candidate was invited to ask the interviewer questions. Judge THEIR questions: thoughtful, specific to the role, team or company, showing research and genuine interest. One or two good questions are plenty. Asking nothing, or only about salary and holidays, scores low. Use "correctness" for relevance, "clarity" for how well they were asked, and "depth" for insight.`;
  }
}

const mockReportSchema = z.object({
  verdict: z.enum(["HIRE", "LEAN_HIRE", "NO_HIRE"]),
  overallScore: z.number().min(1).max(10),
  assessment: z.string().min(1).max(2000),
  strengths: z.array(z.string().max(400)).max(6),
  improvements: z.array(z.string().max(400)).max(6),
});

function mockReportPrompt(params: {
  title: string;
  level: string;
  rounds: { round: MockRound; question: string; answer: string; score: number }[];
  roundScores: { round: string; score: number }[];
}): string {
  const { title, level, rounds, roundScores } = params;
  return [
    `You are the hiring manager deciding on a ${levelLabel(level)} "${title}" candidate after a mock interview.`,
    `Here is every question, the candidate's answer (spoken answers are speech-to-text, so ignore transcription slips), and the score each answer got:`,
    ``,
    ...rounds.map((r, i) => `Q${i + 1} [${ROUND_LABELS[r.round]}]: ${r.question}\nAnswer: ${r.answer.slice(0, 3000)}\nScore: ${r.score}/10`),
    ``,
    `Average score per round: ${roundScores.map((r) => `${r.round} ${r.score}/10`).join(", ")}.`,
    ``,
    `Give an honest verdict as if this were the real interview: "HIRE" (clearly strong for this level), "LEAN_HIRE" (probably yes with some concerns), or "NO_HIRE" (not ready yet). Be fair to the level: don't expect senior depth from a junior.`,
    `"assessment": 3-5 sentences a candidate would want to hear from a hiring manager, explaining the verdict.`,
    `"strengths" and "improvements": 2-4 specific points each, referring to their actual answers. Improvements should say what to do differently next time.`,
    `Respond ONLY with JSON of the shape: { "verdict": "HIRE" | "LEAN_HIRE" | "NO_HIRE", "overallScore": number (1-10), "assessment": string, "strengths": string[], "improvements": string[] }`,
  ].join("\n");
}

// Builds the end-of-interview report from the graded answers. Returns null if nothing was answered.
export async function buildMockReport(sessionId: string, role: { title: string; level: string }) {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { order: "asc" },
    include: { answer: { include: { feedback: true } } },
  });
  const rounds = questions
    .filter((q) => q.round && q.answer?.feedback)
    .map((q) => ({
      round: q.round as MockRound,
      question: q.text,
      answer: q.answer!.transcript,
      score: q.answer!.feedback!.score,
    }));
  if (rounds.length === 0) return null;

  // Per-round averages are computed here, not by the model, so they always match the per-answer scores.
  const roundScores = [...new Set(MOCK_ROUNDS)]
    .map((round) => {
      const scores = rounds.filter((r) => r.round === round).map((r) => r.score);
      return scores.length ? { round, score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 } : null;
    })
    .filter((r): r is { round: MockRound; score: number } => r !== null);

  const report = await generateValidated(mockReportPrompt({ title: role.title, level: role.level, rounds, roundScores }), mockReportSchema);
  return { ...report, roundScores };
}
