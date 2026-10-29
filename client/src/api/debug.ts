import { api } from "./client";
import { DebugChallenge, DebugSummary, Difficulty } from "../types";

export const debugApi = {
  list: () => api.get<{ challenges: DebugSummary[] }>("/debug"),
  create: (language: string, level: Difficulty) => api.post<{ challenge: { id: string } }>("/debug", { language, level }),
  get: (id: string) => api.get<{ challenge: DebugChallenge }>(`/debug/${id}`),
  hint: (id: string) => api.post<{ challenge: DebugChallenge }>(`/debug/${id}/hint`),
  submit: (id: string, body: { code: string; explanation: string; testResults: { passed: number; total: number } | null }) =>
    api.post<{ challenge: DebugChallenge }>(`/debug/${id}/submit`, body),
};
