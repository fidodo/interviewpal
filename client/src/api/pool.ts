import { api } from "./client";
import { Difficulty } from "../types";

// The question pool's admin API (server/src/pool/pool.routes.ts). Only the admin can call it; others get a 404.
export interface PoolRun {
  id: string;
  status: "RUNNING" | "DONE" | "CANCELLED" | "ABANDONED";
  startedAt: string;
  finishedAt: string | null;
  aiCalls: number;
  added: number;
  retired: number;
  log: string[];
  phase: string;
}

export interface PoolStatus {
  serving: boolean;
  counts: { kind: "INTERVIEW" | "DEBUG" | "DESIGN"; level: string; count: number }[];
  slots: { total: number; full: number; empty: number };
  runs: PoolRun[];
  sources: { id: string; repo: string; label: string; licence: string; folder: string; saved: { lastCommit: string | null; checkedAt: string | null; lastError: string | null } | null }[];
  trends: { updatedOn: string; ageDays: number };
}

export interface StepResult {
  busy: boolean;
  status: PoolRun["status"];
  aiCalls: number;
  added: number;
  retired: number;
  log: string[];
  phase: string;
}

export const poolApi = {
  status: () => api.get<PoolStatus>("/admin/pool"),
  setServing: (on: boolean) => api.put<PoolStatus>("/admin/pool/serve", { on }),
  start: (cap: number) => api.post<{ busy: boolean; runId: string }>("/admin/pool/update", { cap }),
  step: (runId: string) => api.post<StepResult>(`/admin/pool/update/${runId}/step`),
  cancel: (runId: string) => api.post<{ status: string }>(`/admin/pool/update/${runId}/cancel`),
};

// "Submit a question you were asked" (server/src/pool/submit.routes.ts and the admin review routes).
export type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface QuestionDraft {
  text: string;
  track: string;
  topic: string;
  level: Difficulty;
  company: string;
}

export interface Submission {
  id: string;
  text: string;
  track: string;
  topic: string;
  level: Difficulty;
  company: string | null;
  status: SubmissionStatus;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface PresetTopic {
  name: string;
  track: string;
}

export interface ReviewQueue {
  pending: Submission[];
  reviewed: Submission[];
  pendingCount: number;
  topics: PresetTopic[];
}

export const submissionsApi = {
  mine: () => api.get<{ submissions: Submission[]; topics: PresetTopic[]; maxPending: number }>("/question-submissions"),
  send: (draft: QuestionDraft) => api.post<{ submission: Submission }>("/question-submissions", draft),
  withdraw: (id: string) => api.del<void>(`/question-submissions/${encodeURIComponent(id)}`),
  // Admin only.
  queue: () => api.get<ReviewQueue>("/admin/pool/submissions"),
  approve: (id: string, draft: QuestionDraft) => api.post<ReviewQueue & { added: boolean }>(`/admin/pool/submissions/${encodeURIComponent(id)}/approve`, draft),
  reject: (id: string) => api.post<ReviewQueue>(`/admin/pool/submissions/${encodeURIComponent(id)}/reject`),
};
