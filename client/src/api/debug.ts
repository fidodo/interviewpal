import { api } from "./client";
import { DebugChallenge, DebugSummary, Difficulty } from "../types";

export const debugApi = {
  list: () => api.get<{ challenges: DebugSummary[] }>("/debug"),
  create: (language: string, level: Difficulty) => api.post<{ challenge: { id: string } }>("/debug", { language, level }),
  // A new exercise with the same stack, level and kinds of bugs as one of yours.
  createSimilar: (similarTo: string) => api.post<{ challenge: { id: string } }>("/debug", { similarTo }),
  get: (id: string) => api.get<{ challenge: DebugChallenge }>(`/debug/${id}`),
  // Sends the current code so the hint is for a bug that is still in it.
  hint: (id: string, code: string) => api.post<{ challenge: DebugChallenge; message: string | null }>(`/debug/${id}/hint`, { code }),
  // "Show me the answer": closes the exercise unscored; the current code decides which bugs count as fixed.
  reveal: (id: string, code: string) => api.post<{ challenge: DebugChallenge }>(`/debug/${id}/reveal`, { code }),
  submit: (id: string, body: { code: string; explanation: string; testResults: { passed: number; total: number } | null }) =>
    api.post<{ challenge: DebugChallenge }>(`/debug/${id}/submit`, body),
};
