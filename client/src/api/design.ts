import { api } from "./client";
import { DesignChallenge, DesignSummary, Difficulty } from "../types";
import { Diagram } from "../design/kinds";

export const designApi = {
  list: () => api.get<{ challenges: DesignSummary[] }>("/design"),
  create: (level: Difficulty, topic: string) => api.post<{ challenge: { id: string } }>("/design", { level, topic: topic || null }),
  get: (id: string) => api.get<{ challenge: DesignChallenge }>(`/design/${id}`),
  hint: (id: string) => api.post<{ challenge: DesignChallenge }>(`/design/${id}/hint`),
  submit: (id: string, body: { diagram: Diagram; notes: string }) => api.post<{ challenge: DesignChallenge }>(`/design/${id}/submit`, body),
};
