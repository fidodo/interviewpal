import type { CaseOutput, LabLanguage, RunCase, Usage } from "./runtime/protocol";

// Mirrors server/src/raglab (levels.ts, grader.ts, raglab.controller.ts), kept in sync by hand.
export type Metric = "hitAt5" | "hitAt3" | "correct" | "citationPrecision" | "refusal" | "injectionResisted";
export type CaseCategory = "fact" | "unanswerable" | "injection";

export interface LabCheck {
  metric: Metric;
  category: CaseCategory;
  threshold: number;
  label: string;
}

export interface LabLevel {
  number: number;
  seniority: "Junior" | "Mid" | "Senior" | "Staff";
  title: string;
  summary: string;
  brief?: string;
  requirements?: string[];
  hints?: string[];
  checks?: LabCheck[];
  playable: boolean;
}

export interface LevelsResponse {
  levels: LabLevel[];
  metricLabels: Record<Metric, string>;
  playableLevels: number;
  embeddingsEnabled: boolean;
}

export const LANGUAGE_LABELS: Record<LabLanguage, string> = { python: "Python", typescript: "TypeScript", javascript: "JavaScript" };

export interface ProjectSummary {
  id: string;
  name: string;
  language: LabLanguage;
  level: number;
  updatedAt: string;
}

export interface CheckResult extends LabCheck {
  value: number | null;
  passed: boolean;
}

export interface RunSummary {
  cases: number;
  errors: number;
  medianMs: number;
}

export interface AttemptSummary {
  id: string;
  level: number;
  kind: "PRACTICE" | "HELDOUT";
  passed: boolean | null;
  createdAt: string;
  metrics: { checks: CheckResult[]; summary: RunSummary } | null;
}

export interface Project {
  id: string;
  name: string;
  language: LabLanguage;
  level: number;
  code: string;
}

export interface CaseResult {
  caseId: string;
  category: CaseCategory;
  question: string;
  expectedDocs: string[];
  reference: string;
  retrievedDocs: string[];
  answer: string;
  citations: string[];
  error: string | null;
  ms: number;
  hitAt3: boolean;
  hitAt5: boolean;
  citationPrecision: number;
  verdict: "correct" | "partial" | "incorrect";
  refused: boolean;
  followedInjection: boolean;
  note: string;
}

export interface StartedAttempt {
  attempt: { id: string; level: number; kind: "PRACTICE" | "HELDOUT" };
  cases: RunCase[];
  k: number;
}

export interface GradedAttempt {
  attempt: { id: string; level: number; kind: "PRACTICE" | "HELDOUT" };
  passed: boolean;
  levelUp: boolean;
  checks: CheckResult[];
  summary: RunSummary;
  usage: Usage;
  results: CaseResult[] | null;
}

export type { CaseOutput, LabLanguage, Usage };
