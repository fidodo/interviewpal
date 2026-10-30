import { z } from "zod";
import { levelLabel } from "../roles/roles.prompts";
import { codeSpecSchema } from "../ai/schemas";

// Stacks the learner can debug. Runnable ones execute against tests in the browser (Pyodide / a JS worker);
// the rest are graded by the AI reading the fix. Mirrored in client/src/types/index.ts (DEBUG_LANGUAGES).
export const DEBUG_LANGUAGES = {
  python: { label: "Python", runnable: true },
  javascript: { label: "JavaScript", runnable: true },
  typescript: { label: "TypeScript", runnable: false },
  react: { label: "React (JSX)", runnable: false },
  java: { label: "Java", runnable: false },
  csharp: { label: "C#", runnable: false },
  go: { label: "Go", runnable: false },
  sql: { label: "SQL", runnable: false },
  php: { label: "PHP", runnable: false },
  ruby: { label: "Ruby", runnable: false },
  kotlin: { label: "Kotlin", runnable: false },
  cpp: { label: "C++", runnable: false },
} as const;

export type DebugLanguage = keyof typeof DEBUG_LANGUAGES;
export const DEBUG_LANGUAGE_KEYS = Object.keys(DEBUG_LANGUAGES) as [DebugLanguage, ...DebugLanguage[]];

const BUG_COUNT: Record<string, string> = { JUNIOR: "exactly 1 bug", INTERMEDIATE: "2 bugs", SENIOR: "2-3 subtle bugs" };

export function challengeSchema(runnable: boolean) {
  return z.object({
    title: z.string().trim().min(1).max(120),
    scenario: z.string().trim().min(1).max(1500),
    buggyCode: z.string().min(20).max(8000),
    bugs: z
      .array(z.object({ description: z.string().min(1).max(600), hint: z.string().min(1).max(400) }))
      .min(1)
      .max(4),
    referenceFix: z.string().min(20).max(8000),
    spec: runnable ? codeSpecSchema : codeSpecSchema.nullish().catch(null),
  });
}

export const debugGradeSchema = z.object({
  score: z.number().transform((n) => Math.min(10, Math.max(1, Math.round(n)))),
  bugsFixed: z.number().transform((n) => Math.max(0, Math.round(n))),
  feedback: z.string().min(1).max(2000),
  missed: z.array(z.string().max(600)).max(6).default([]),
});

export function challengePrompt(params: { language: DebugLanguage; level: string; roleTitle: string | null; recentTitles: string[] }): string {
  const { language, level, roleTitle, recentTitles } = params;
  const { label, runnable } = DEBUG_LANGUAGES[language];
  return [
    `You write realistic debugging exercises for a ${levelLabel(level)} developer${roleTitle ? ` preparing for a "${roleTitle}" job` : ""}.`,
    `Language/stack: ${label}.`,
    `Write a short, realistic piece of ${label} code (20-60 lines) from a real-world scenario (e.g. a pricing function, a data clean-up, an API handler, a React component, a SQL report) that contains ${BUG_COUNT[level] ?? "2 bugs"}.`,
    `Bugs must be the kind that ship in real code: off-by-one, wrong condition, mutating shared state, missing edge case (empty input, null), wrong operator, async/await misuse, wrong JOIN or GROUP BY, stale state in React, and so on. No syntax errors unless the level is junior, and never comments or names that point at the bugs.`,
    runnable
      ? `The code must define a function that "spec" describes (same name and parameters), using only the standard library, with no I/O, imports of third-party packages${language === "javascript" ? ", require/import statements or DOM access" : ""}. "spec.tests": 3-6 cases { "args": [...], "expected": ... } with plain JSON values that ALL pass on referenceFix, where at least one FAILS on buggyCode.`
      : `"spec" must be null (this stack isn't run, the fix is reviewed).`,
    recentTitles.length ? `Don't repeat these recent exercises: ${recentTitles.join("; ")}.` : null,
    ``,
    `"title": a short name. "scenario": 2-4 sentences: what the code is meant to do and the symptom someone reported (not the cause).`,
    `"bugs": one entry per bug: "description" (what's wrong and why, for marking) and "hint" (a nudge towards where to look, without the answer).`,
    `"referenceFix": the full corrected code, changing only what's needed.`,
    `Respond ONLY with JSON of the shape: { "title": string, "scenario": string, "buggyCode": string, "bugs": [{ "description": string, "hint": string }], "referenceFix": string, "spec": { "functionName": string, "params": string[], "tests": [{ "args": any[], "expected": any }] } | null }`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function gradePrompt(params: {
  language: DebugLanguage;
  level: string;
  scenario: string;
  buggyCode: string;
  bugs: { description: string }[];
  referenceFix: string;
  submittedCode: string;
  explanation: string;
  testResults: { passed: number; total: number } | null;
  hintsUsed: number;
}): string {
  const p = params;
  return [
    `You are marking a ${levelLabel(p.level)} developer's debugging exercise in ${DEBUG_LANGUAGES[p.language].label}.`,
    `Scenario: ${p.scenario}`,
    `Original buggy code:\n${p.buggyCode}`,
    `The bugs that were planted:\n${p.bugs.map((b, i) => `${i + 1}. ${b.description}`).join("\n")}`,
    `A reference fix:\n${p.referenceFix}`,
    ``,
    `Their fixed code:\n${p.submittedCode.slice(0, 8000)}`,
    `Their explanation of what was wrong:\n${p.explanation.slice(0, 3000) || "(none given)"}`,
    p.testResults
      ? `Their code was run against ${p.testResults.total} tests in the browser and ${p.testResults.passed} passed.`
      : `Their code wasn't run (this stack is reviewed only), so judge whether the fix is correct by reading it.`,
    `They used ${p.hintsUsed} hint${p.hintsUsed === 1 ? "" : "s"}.`,
    ``,
    `"bugsFixed": how many of the planted bugs their code genuinely fixes (a different but correct fix counts).`,
    `"score" 1-10: mostly whether the bugs are fixed without breaking anything, then whether the explanation shows they understood the root cause, minus about 1 point per hint used. A full rewrite that works is fine but say a targeted fix is better in an interview.`,
    `"feedback": 2-4 sentences. "missed": for each bug they didn't fix, what it was (empty if none).`,
    `Respond ONLY with JSON of the shape: { "score": number, "bugsFixed": number, "feedback": string, "missed": string[] }`,
  ].join("\n");
}
