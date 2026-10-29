import { api } from "./client";
import { Difficulty, LearnAnswerResult, LearnCourse, LearnCourseSummary, LearnLesson, ReviewItem } from "../types";

export const learnApi = {
  list: () => api.get<{ courses: LearnCourseSummary[]; dueCount: number }>("/learn/courses"),
  // Reuses the skill's course if it exists (free), otherwise creates it (an AI call).
  openForSkill: async (skillId: string) => {
    const { course } = await api.get<{ course: { id: string } | null }>(`/learn/courses/for-skill/${skillId}`);
    return course ? { course } : api.post<{ course: { id: string } }>("/learn/courses", { skillId });
  },
  createForTopic: (topic: string, level: Difficulty) => api.post<{ course: { id: string } }>("/learn/courses", { topic, level }),
  course: (id: string) => api.get<{ course: LearnCourse }>(`/learn/courses/${id}`),
  remove: (id: string) => api.del<void>(`/learn/courses/${id}`),
  lesson: (id: string) => api.get<{ lesson: LearnLesson }>(`/learn/lessons/${id}`),
  writeLesson: (id: string) => api.post<void>(`/learn/lessons/${id}/generate`),
  answerChoice: (questionId: string, choice: number, fromReview = false) =>
    api.post<{ result: LearnAnswerResult }>(`/learn/questions/${questionId}/answer`, { choice, fromReview }),
  answerWritten: (questionId: string, text: string, fromReview = false) =>
    api.post<{ result: LearnAnswerResult }>(`/learn/questions/${questionId}/answer-written`, { text, fromReview }),
  review: () => api.get<{ items: ReviewItem[] }>("/learn/review"),
};
