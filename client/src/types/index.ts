export type Track = string;
export const PRESET_TRACKS = ["Frontend", "Backend", "Full-stack", "AI Engineering"] as const;
export type Difficulty = "JUNIOR" | "INTERMEDIATE" | "SENIOR";
export type SessionStatus = "ACTIVE" | "COMPLETED";
export type QuestionType = "VERBAL" | "CODING";

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  // false for Google-only accounts
  hasPassword: boolean;
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

export interface FeedbackBreakdown {
  correctness: number;
  clarity: number;
  depth: number;
}

export interface Feedback {
  score: number;
  breakdown: FeedbackBreakdown | null;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface FillerStats {
  count: number;
  words: Record<string, number>;
  wordCount: number;
}

export type MockRound = "BEHAVIOURAL" | "ROLE" | "CLOSING";

export const ROUND_LABELS: Record<MockRound, string> = {
  BEHAVIOURAL: "Behavioural",
  ROLE: "Role-specific",
  CLOSING: "Your questions for us",
};

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  order: number;
  // Mock interviews only.
  round?: MockRound | null;
}

export interface QuestionWithAnswer extends Question {
  answer: { id: string; transcript: string; fillerStats: FillerStats | null; feedback: Feedback | null } | null;
}

export interface SessionDetail {
  id: string;
  topic: Topic;
  track: Track;
  difficulty: Difficulty;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  // "MOCK" sessions run a fixed number of rounds (plannedRounds) and hide feedback until they're finished.
  mode: "PRACTICE" | "MOCK";
  plannedRounds: number | null;
  questions: QuestionWithAnswer[];
}

export type Verdict = "HIRE" | "LEAN_HIRE" | "NO_HIRE";

export interface Summary {
  overallScore: number;
  assessment: string;
  strengths: string[];
  improvements: string[];
  // Mock interviews only.
  verdict: Verdict | null;
  roundScores: { round: MockRound; score: number }[] | null;
}

// ---- Target roles (mirrors server/src/roles/roles.controller.ts responses) ----

export type SkillCategory = "TECHNICAL" | "DOMAIN" | "BEHAVIOURAL";

export const LEVEL_LABELS: Record<Difficulty, string> = { JUNIOR: "Junior", INTERMEDIATE: "Mid-level", SENIOR: "Senior" };

export interface RoleSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  importance: number;
  selfRating: number | null;
  rating: number | null;
  ratingWeekAgo: number | null;
  evidenceCount: number;
  history: { rating: number; source: "SELF" | "INTERVIEW"; at: string }[];
}

export interface WeeklyGoal {
  id: string;
  text: string;
  done: boolean;
  skillId: string | null;
}

export interface TargetRole {
  id: string;
  title: string;
  level: Difficulty;
  targetDate: string | null;
  jobDescription: string | null;
  cvSummary: string | null;
  isTechnical: boolean;
  isActive: boolean;
  sessionCount: number;
}

export interface RoleDetail {
  role: TargetRole;
  skills: RoleSkill[];
  goals: WeeklyGoal[];
  readiness: number | null;
  // Change in readiness over the last week, measured on the skills that were already rated a week ago.
  readinessChange: number | null;
}

export interface RoleListItem {
  id: string;
  title: string;
  level: Difficulty;
  targetDate: string | null;
  isActive: boolean;
  skillCount: number;
  readiness: number | null;
}
