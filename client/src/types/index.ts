export type Track = string;
export const PRESET_TRACKS = ["Frontend", "Backend", "Full-stack", "AI Engineering"] as const;
export type Difficulty = "JUNIOR" | "INTERMEDIATE" | "SENIOR";
export type SessionStatus = "ACTIVE" | "COMPLETED";
export type QuestionType = "VERBAL" | "CODING";

export interface User {
  id: string;
  email: string;
}

export interface Topic {
  id: string;
  name: string;
  track: Track;
  isCustom: boolean;
}

export interface SessionListItem {
  id: string;
  topic: Topic;
  track: Track;
  difficulty: Difficulty;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  summary: { overallScore: number } | null;
}

export interface Feedback {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  order: number;
}

export interface QuestionWithAnswer extends Question {
  answer: { id: string; transcript: string; feedback: Feedback | null } | null;
}

export interface SessionDetail {
  id: string;
  topic: Topic;
  track: Track;
  difficulty: Difficulty;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  questions: QuestionWithAnswer[];
}

export interface Summary {
  overallScore: number;
  assessment: string;
  strengths: string[];
  improvements: string[];
}
