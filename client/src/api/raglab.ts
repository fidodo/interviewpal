import { api } from "./client";
import { AttemptSummary, CaseOutput, GradedAttempt, LabLanguage, LevelsResponse, Project, ProjectSummary, StartedAttempt, Usage } from "../raglab/types";

export const raglabApi = {
  levels: () => api.get<LevelsResponse>("/rag-lab/levels"),
  projects: () => api.get<{ projects: ProjectSummary[] }>("/rag-lab/projects"),
  createProject: (name: string, language: LabLanguage) => api.post<{ project: { id: string } }>("/rag-lab/projects", { name, language }),
  project: (id: string) => api.get<{ project: Project; attempts: AttemptSummary[] }>(`/rag-lab/projects/${id}`),
  saveCode: (id: string, code: string) => api.put<{ ok: true }>(`/rag-lab/projects/${id}/code`, { code }),
  deleteProject: (id: string) => api.del<{ ok: true }>(`/rag-lab/projects/${id}`),
  startAttempt: (id: string, kind: "PRACTICE" | "HELDOUT", code: string) => api.post<StartedAttempt>(`/rag-lab/projects/${id}/attempts`, { kind, code }),
  grade: (attemptId: string, outputs: CaseOutput[], usage: Usage) => api.post<GradedAttempt>(`/rag-lab/attempts/${attemptId}/grade`, { outputs, usage }),
};
