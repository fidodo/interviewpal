import { api } from "./client";
import { Difficulty, RoleDetail, RoleListItem } from "../types";

export interface RoleInput {
  title: string;
  level: Difficulty;
  targetDate: string | null;
  jobDescription: string | null;
  cvSummary: string | null;
  isTechnical?: boolean;
}

export const rolesApi = {
  list: () => api.get<{ roles: RoleListItem[] }>("/roles"),
  active: () => api.get<{ active: RoleDetail | null }>("/roles/active"),
  get: (id: string) => api.get<RoleDetail>(`/roles/${id}`),
  create: (input: RoleInput) => api.post<{ role: { id: string } }>("/roles", input),
  update: (id: string, input: Partial<RoleInput>) => api.patch<{ role: { id: string } }>(`/roles/${id}`, input),
  remove: (id: string) => api.del<void>(`/roles/${id}`),
  activate: (id: string) => api.post<void>(`/roles/${id}/activate`),
  rate: (id: string, ratings: { skillId: string; rating: number }[]) => api.put<void>(`/roles/${id}/ratings`, { ratings }),
  addSkill: (id: string, name: string) => api.post<{ skill: { id: string } }>(`/roles/${id}/skills`, { name }),
  removeSkill: (id: string, skillId: string) => api.del<void>(`/roles/${id}/skills/${skillId}`),
  regenerateSkills: (id: string) => api.post<void>(`/roles/${id}/skills/regenerate`),
  planWeek: (id: string) => api.post<void>(`/roles/${id}/goals/generate`),
  setGoalDone: (id: string, goalId: string, done: boolean) => api.patch<void>(`/roles/${id}/goals/${goalId}`, { done }),
  practice: (id: string, skillId?: string) => api.post<{ session: { id: string } }>(`/roles/${id}/practice`, skillId ? { skillId } : {}),
};
