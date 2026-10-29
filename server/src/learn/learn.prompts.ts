import { levelLabel } from "../roles/roles.prompts";

// Prompts for "Learn this" courses (see learn.service.ts). Adult learners preparing for jobs and interviews.

export function outlinePrompt(params: { topic: string; level: string; context: string }): string {
  const { topic, level, context } = params;
  return [
    `You are an expert teacher writing a short, practical course on "${topic}" for a ${levelLabel(level)} learner.`,
    context ? `Context: ${context}` : ``,
    `Plan 4-6 lessons that build on each other, from the essentials to what an interviewer at this level would probe. Each lesson should take about 10 minutes.`,
    `"title" is the course title (at most 8 words). "summary" is one sentence on what they'll be able to do afterwards.`,
    `For each lesson: "title" (at most 8 words) and "objective" (one sentence starting with a verb, e.g. "Explain how...").`,
    `Respond ONLY with JSON of the shape: { "title": string, "summary": string, "lessons": [{ "title": string, "objective": string }] }`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function lessonPrompt(params: {
  courseTitle: string;
  level: string;
  context: string;
  lesson: { title: string; objective: string };
  outline: string[];
}): string {
  const { courseTitle, level, context, lesson, outline } = params;
  return [
    `You are an expert teacher writing one lesson of the course "${courseTitle}" for a ${levelLabel(level)} learner.`,
    context ? `Context: ${context}` : ``,
    `Course outline: ${outline.map((t, i) => `${i + 1}. ${t}`).join("; ")}.`,
    `This lesson: "${lesson.title}". Objective: ${lesson.objective}`,
    ``,
    `"content": the lesson itself, 300-600 words, clear and practical with one concrete example. Format with plain lines only: "## " for at most 3 short subheadings, "- " for bullet points, and fenced code blocks (\`\`\`) only if code genuinely helps. No other markdown (no bold, links, tables or images).`,
    `"questions": exactly 4 questions that check the objective, in this order:`,
    `- 3 with "kind": "MCQ": "prompt", "options" (exactly 4 plausible options, one correct), "correctIndex" (0-3), "explanation" (1-2 sentences on why the correct answer is right).`,
    `- 1 with "kind": "SHORT": an interview-style question answerable in 2-4 sentences, with "modelAnswer" (what a strong answer covers) and "explanation".`,
    `Respond ONLY with JSON of the shape: { "content": string, "questions": [{ "kind": "MCQ" | "SHORT", "prompt": string, "options"?: string[], "correctIndex"?: number, "modelAnswer"?: string, "explanation": string }] }`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function shortAnswerPrompt(params: { question: string; modelAnswer: string; response: string; level: string }): string {
  const { question, modelAnswer, response, level } = params;
  return [
    `You are marking a ${levelLabel(level)} learner's short written answer.`,
    `Question: ${question}`,
    `What a strong answer covers: ${modelAnswer}`,
    `Learner's answer: ${response.slice(0, 3000)}`,
    ``,
    `Mark it "correct" if it gets the main idea right, even if it's brief or worded differently. Mark it incorrect if the key point is missing or wrong.`,
    `"feedback": 1-3 sentences: what was good, and what was missing or wrong.`,
    `Respond ONLY with JSON of the shape: { "correct": boolean, "feedback": string }`,
  ].join("\n");
}
