import { Difficulty, QuestionType, Track } from "../types";
import { PriorQA } from "./provider.interface";

const MAX_PRIOR_QA = 20;

function formatTrack(track: Track): string {
  return track.toLowerCase();
}

function formatHistory(priorQA: PriorQA[]): string {
  const trimmed = priorQA.slice(-MAX_PRIOR_QA);
  if (trimmed.length === 0) return "(no questions asked yet — this is the first question)";
  return trimmed
    .map((qa, i) => {
      const tag = qa.questionType === "CODING" ? " [coding]" : "";
      return `Q${i + 1}${tag}: ${qa.question}\nA${i + 1}: ${qa.answer}${qa.score != null ? `\nScore: ${qa.score}/10` : ""}`;
    })
    .join("\n\n");
}

export function questionPrompt(params: { topic: string; track: Track; difficulty: Difficulty; priorQA: PriorQA[] }): string {
  const { topic, track, difficulty, priorQA } = params;
  return [
    `You are a technical interviewer conducting a ${formatTrack(track)} interview at ${difficulty.toLowerCase()} level on the topic "${topic}".`,
    `Ask one clear, focused question at a time. Build naturally on prior answers when relevant — ask follow-ups that probe depth if the candidate did well, or clarify fundamentals if they struggled.`,
    `Do not repeat a question already asked in this session.`,
    `Decide the question's type based on what best tests this topic: use type "CODING" when the best way to test the candidate is to have them implement something — write a function, solve an algorithm, fix a bug in a snippet, write a query, etc. Use type "VERBAL" when the topic is best tested by an explanation — architecture, tradeoffs, design decisions, how something works conceptually. For topics centered on algorithms, data structures, or implementation (e.g. a topic literally about writing code), most or all questions should be "CODING". For topics centered on design/best-practices/conceptual understanding, most questions should be "VERBAL". Don't default to "VERBAL" just because it's safer — pick whichever type actually tests the candidate better for this specific question.`,
    ``,
    `Interview so far:`,
    formatHistory(priorQA),
    ``,
    `Ask the next question. Respond ONLY with JSON of the shape: { "text": string, "type": "VERBAL" | "CODING" }`,
  ].join("\n");
}

export function gradingPrompt(params: { question: string; transcript: string; difficulty: Difficulty; questionType: QuestionType }): string {
  const { question, transcript, difficulty, questionType } = params;
  const modeInstructions =
    questionType === "CODING"
      ? `The candidate's answer is code they typed directly into a plain text box (no IDE, no autocomplete, no syntax highlighting). Judge correctness of logic, handling of edge cases, and time/space complexity where relevant. Be lenient on minor syntax slips (missing semicolons, small typos) but strict on whether the approach actually solves the problem.`
      : `The candidate's answer is a speech-to-text transcript and may contain mis-transcribed technical terms or minor grammar artifacts — be lenient on phrasing, strict on substance.`;
  return [
    `You are grading a candidate's interview answer for a ${difficulty.toLowerCase()}-level technical role.`,
    `Be fair but rigorous for the stated level — junior answers should not be held to senior-level depth, and senior answers should be held to a higher bar.`,
    modeInstructions,
    ``,
    `Question: ${question}`,
    `Candidate's answer: ${transcript}`,
    ``,
    `Respond ONLY with JSON of the shape: { "score": number (1-10), "strengths": string[], "weaknesses": string[], "suggestions": string[] }`,
  ].join("\n");
}

export function summaryPrompt(params: { topic: string; track: Track; difficulty: Difficulty; priorQA: PriorQA[] }): string {
  const { topic, track, difficulty, priorQA } = params;
  return [
    `You are summarizing a candidate's performance in a ${formatTrack(track)} interview at ${difficulty.toLowerCase()} level on the topic "${topic}".`,
    `Below is the full set of questions, answers (speech-to-text transcripts), and per-answer scores from the session.`,
    ``,
    formatHistory(priorQA),
    ``,
    `Write an overall assessment of the candidate's performance in this session: an overall score, a short paragraph assessment, a list of specific strengths, and a list of specific areas to improve.`,
    `Respond ONLY with JSON of the shape: { "overallScore": number (1-10), "assessment": string, "strengths": string[], "improvements": string[] }`,
  ].join("\n");
}
