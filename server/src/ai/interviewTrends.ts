// What technical interviews emphasise now, given to the question pool's update (pool/fill.ts) when it writes new
// questions, so the bank keeps up with how interviews change. Hand-kept: review it every quarter, update UPDATED_ON,
// and keep each line short. The update logs a warning when it's more than 120 days old.
export const UPDATED_ON = "2026-11-24";

// Sources (checked on UPDATED_ON): Karat engineering interview trends 2026 (karat.com/engineering-interview-trends-2026),
// Google's AI-assisted coding round (careers.northeastern.edu, 2026-05-13), LeadDev "think the technical interview is
// dead? think again", Interview Query on technical interviews and AI (2026).
export const TRENDS = {
  general: [
    "Reading, debugging and reviewing existing code (often AI-written) more than writing from scratch.",
    "Explaining trade-offs and reasoning out loud, not just reaching an answer.",
  ],
  coding: ["Validating and fixing AI-generated code: missed edge cases, wrong library use, swallowed errors."],
  debug: [
    "Bugs that AI assistants and rushed code introduce: off-by-one, missing null/empty handling, unsafe input handling, async mistakes.",
    "Security issues from the OWASP top 10 in everyday code (injection, broken access checks).",
  ],
  design: ["Practical systems with clear requirements, trade-offs and failure modes; for AI products, retrieval, evaluation, latency and cost."],
  ai: ["RAG, evaluation of LLM output, prompt injection and guardrails, latency and cost trade-offs."],
} as const;

export function trendsFor(kind: "INTERVIEW" | "DEBUG" | "DESIGN", track?: string | null): string[] {
  if (kind === "DEBUG") return [...TRENDS.general.slice(0, 1), ...TRENDS.debug];
  if (kind === "DESIGN") return [...TRENDS.general.slice(1), ...TRENDS.design];
  return [...TRENDS.general, ...(track === "AI Engineering" ? TRENDS.ai : TRENDS.coding)];
}

export function trendsAgeDays(now = new Date()): number {
  return Math.floor((now.getTime() - new Date(`${UPDATED_ON}T00:00:00Z`).getTime()) / 86_400_000);
}
