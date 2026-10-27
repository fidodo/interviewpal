import { api } from "../api/client";
import { ActivityChallenge, Attempt, Avatar, Challenge, ChallengeDetail, Child, Course, CourseProgress, HelpMessage } from "./types";

export type PinResetMethod = "password" | "google";

export interface ChildInput {
  displayName: string;
  age: number;
  avatar: Avatar;
}

export const kidsApi = {
  listChildren: () => api.get<{ children: Child[]; hasPin: boolean; pinResetMethod: PinResetMethod }>("/kids/children"),
  createChild: (input: ChildInput) => api.post<{ child: Child }>("/kids/children", input),
  updateChild: (id: string, input: Partial<ChildInput>) => api.patch<{ child: Child }>(`/kids/children/${id}`, input),
  deleteChild: (id: string) => api.del<void>(`/kids/children/${id}`),
  activity: (id: string) => api.get<{ challenges: ActivityChallenge[] }>(`/kids/children/${id}/activity`),

  setPin: (pin: string, currentPin?: string) => api.post<void>("/kids/pin", { pin, currentPin }),
  verifyPin: (pin: string) => api.post<void>("/kids/pin/verify", { pin }),
  resetPin: (pin: string, proof: { password?: string; credential?: string }) => api.post<void>("/kids/pin/reset", { pin, ...proof }),

  listCourses: () => api.get<{ courses: Course[] }>("/kids/courses"),
  progress: (childId: string, slug: string) => api.get<CourseProgress>(`/kids/children/${childId}/courses/${slug}`),
  setLevel: (childId: string, slug: string, currentLevel: number) =>
    api.patch<{ enrollment: CourseProgress["enrollment"] }>(`/kids/children/${childId}/courses/${slug}`, { currentLevel }),
  nextChallenge: (childId: string, slug: string, fresh = false) =>
    api.post<{ challenge: Challenge }>(`/kids/children/${childId}/courses/${slug}/challenges`, { fresh }),

  challenge: (id: string) => api.get<ChallengeDetail>(`/kids/challenges/${id}`),
  submit: (id: string, body: { code: string; output: string; error: string | null; turtle: string; input: string }) =>
    api.post<{ attempt: Attempt; leveledUp: boolean; courseComplete: boolean }>(`/kids/challenges/${id}/attempts`, body),
  help: (id: string, message: string, code: string) => api.post<{ messages: HelpMessage[] }>(`/kids/challenges/${id}/help`, { message, code }),
};
