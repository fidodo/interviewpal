import { Difficulty, QuestionType, Track } from "../types";
import { PriorQA, RoleContext } from "./provider.interface";

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

const MAX_JOB_DESCRIPTION_CHARS = 2500;

// Extra instructions when practising for a target role: aim at its skills, tag what each question tests, and
// never ask for code in a non-technical role.
function roleInstructions(role: RoleContext): string[] {
  const lines = [
    `The candidate is preparing for this role: "${role.title}". The skills that matter for it are: ${role.skills.join("; ")}.`,
  ];
  if (role.roundInstructions) lines.push(role.roundInstructions);
  else if (role.focusSkill) lines.push(`Focus this question on the skill "${role.focusSkill}".`);
  if (role.jobDescription) {
    lines.push(`The job description they are applying to (use it to make questions realistic for this employer):\n${role.jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS)}`);
  }
  if (!role.isTechnical) lines.push(`This is not a technical role: always use type "VERBAL", including behavioural (STAR) and role-specific situational questions.`);
  lines.push(`Also return "skills": the 1-3 names from the skills list above that this question tests, spelled exactly as listed.`);
  return lines;
}

export function questionPrompt(params: { topic: string; track: Track; difficulty: Difficulty; priorQA: PriorQA[]; role?: RoleContext }): string {
  const { topic, track, difficulty, priorQA, role } = params;
  return [
    role
      ? `You are an interviewer for the role "${role.title}" at ${difficulty.toLowerCase()} level, currently on the topic "${topic}".`
      : `You are a technical interviewer conducting a ${formatTrack(track)} interview at ${difficulty.toLowerCase()} level on the topic "${topic}".`,
    `Ask one clear, focused question at a time. Build naturally on prior answers when relevant — ask follow-ups that probe depth if the candidate did well, or clarify fundamentals if they struggled.`,
    `Do not repeat a question already asked in this session.`,
    `Decide the question's type based on what best tests this topic: use type "CODING" when the best way to test the candidate is to have them implement something — write a function, solve an algorithm, fix a bug in a snippet, write a query, etc. Use type "VERBAL" when the topic is best tested by an explanation — architecture, tradeoffs, design decisions, how something works conceptually. For topics centered on algorithms, data structures, or implementation (e.g. a topic literally about writing code), most or all questions should be "CODING". For topics centered on design/best-practices/conceptual understanding, most questions should be "VERBAL". Don't default to "VERBAL" just because it's safer — pick whichever type actually tests the candidate better for this specific question.`,
    ``,
    ...(role ? [``, ...roleInstructions(role)] : []),
    ``,
    `Interview so far:`,
    formatHistory(priorQA),
    ``,
    role
      ? `Ask the next question. Respond ONLY with JSON of the shape: { "text": string, "type": "VERBAL" | "CODING", "skills": string[] }`
      : `Ask the next question. Respond ONLY with JSON of the shape: { "text": string, "type": "VERBAL" | "CODING" }`,
  ].join("\n");
}

export function gradingPrompt(params: {
  question: string;
  transcript: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  roundInstructions?: string;
}): string {
  const { question, transcript, difficulty, questionType, roundInstructions } = params;
  const modeInstructions =
    questionType === "CODING"
      ? `The candidate's answer is code they typed directly into a plain text box (no IDE, no autocomplete, no syntax highlighting). Judge correctness of logic, handling of edge cases, and time/space complexity where relevant. Be lenient on minor syntax slips (missing semicolons, small typos) but strict on whether the approach actually solves the problem.`
      : `The candidate's answer is a speech-to-text transcript and may contain mis-transcribed technical terms or minor grammar artifacts — be lenient on phrasing, strict on substance.`;
  return [
    `You are grading a candidate's interview answer for a ${difficulty.toLowerCase()}-level technical role.`,
    `Be fair but rigorous for the stated level — junior answers should not be held to senior-level depth, and senior answers should be held to a higher bar.`,
    modeInstructions,
    ...(roundInstructions ? [roundInstructions] : []),
    ``,
    `Question: ${question}`,
    `Candidate's answer: ${transcript}`,
    ``,
    `In addition to the overall score, rate three specific dimensions 1-10 each: "correctness" (how accurate/complete the answer is), "clarity" (how well-structured and easy to follow it is), and "depth" (how much nuance, edge-case awareness, or going-beyond-the-obvious it shows).`,
    `Respond ONLY with JSON of the shape: { "score": number (1-10), "breakdown": { "correctness": number (1-10), "clarity": number (1-10), "depth": number (1-10) }, "strengths": string[], "weaknesses": string[], "suggestions": string[] }`,
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
