import type { CodeSpec } from "../code/protocol";
import type { Diagram } from "../design/kinds";

export type Track = string;

// Interviewer styles (mirrors server/src/ai/personas.ts).
export type Persona = "NEUTRAL" | "FRIENDLY_STARTUP" | "BIG_TECH_STRICT";
export const PERSONA_LABELS: Record<Persona, string> = {
  NEUTRAL: "Balanced",
  FRIENDLY_STARTUP: "Friendly startup",
  BIG_TECH_STRICT: "Big Tech, strict",
};
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
  // Shows the admin pages (the server checks it on every admin route).
  isAdmin?: boolean;
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
  // With `marking`, the parts are points (correctness 0-5, depth 0-3, clarity 0-2) adding up to the score; without
  // it (answers marked before points), 1-10 ratings.
  breakdown: FeedbackBreakdown | null;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  marking?: { reasons: Record<string, string>; toImprove: ImproveStep[] } | null;
  guide?: RubricGuide;
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
  // CODING questions that can be run against tests in the browser.
  codeSpec?: CodeSpec | null;
  // Set when this question follows up on an earlier one (that question's id).
  followUpOf?: string | null;
  // Set when the question came from the shared pool: its credit and the id to vote on.
  pool?: { itemId: string; credit: string | null; sourceUrl: string | null; licence: string | null } | null;
}

// Answering a question again for practice. The original answer and the session report don't change.
export interface Retake {
  number: number;
  transcript: string;
  fillerStats: FillerStats | null;
  createdAt: string;
  feedback: Feedback;
}

export const MAX_RETAKES = 3;

export interface QuestionWithAnswer extends Question {
  answer: { id: string; transcript: string; fillerStats: FillerStats | null; feedback: Feedback | null; retakes: Retake[] } | null;
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
  persona: Persona;
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
  // Mock interviews with a story bank: per behavioural answer, the story it told and a better one.
  storyNotes?: StoryNote[] | null;
}

export interface StoryNote {
  order: number;
  used: { id: string; title: string } | null;
  suggested: { id: string; title: string } | null;
  note: string;
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

// ---- "Learn this" courses (mirrors server/src/learn/learn.controller.ts responses) ----

export interface LearnCourseSummary {
  id: string;
  title: string;
  summary: string;
  level: Difficulty;
  skillId: string | null;
  lessonCount: number;
  completedCount: number;
}

export interface LearnCourse {
  id: string;
  title: string;
  summary: string;
  level: Difficulty;
  skill: { name: string; roleTitle: string } | null;
  lessons: { id: string; order: number; title: string; objective: string; written: boolean; completed: boolean; questionCount: number }[];
}

export interface LearnAnswerResult {
  correct: boolean;
  feedback: string;
  correctIndex: number | null;
  modelAnswer: string | null;
  explanation: string;
  nextReviewDays?: number | null;
  mastered?: boolean;
  lessonComplete?: boolean;
  // What the learner answered (present when re-opening a lesson).
  response?: string;
}

export interface LearnQuestion {
  id: string;
  order?: number;
  kind: "MCQ" | "SHORT";
  prompt: string;
  options: string[];
  result?: LearnAnswerResult | null;
}

export interface LearnLesson {
  id: string;
  order: number;
  title: string;
  objective: string;
  content: string | null;
  completed: boolean;
  course: { id: string; title: string; lessonCount: number };
  nextLessonId: string | null;
  questions: LearnQuestion[];
}

export interface ReviewItem {
  id: string;
  box: number;
  question: LearnQuestion;
  lessonTitle: string;
  course: { id: string; title: string };
}

// ---- Debugging practice (mirrors server/src/debug) ----

export const DEBUG_LANGUAGES: Record<string, { label: string; runnable: boolean }> = {
  python: { label: "Python", runnable: true },
  javascript: { label: "JavaScript", runnable: true },
  typescript: { label: "TypeScript", runnable: false },
  react: { label: "React (JSX)", runnable: false },
  java: { label: "Java", runnable: false },
  csharp: { label: "C#", runnable: false },
  go: { label: "Go", runnable: false },
  sql: { label: "SQL", runnable: false },
  php: { label: "PHP", runnable: false },
  ruby: { label: "Ruby", runnable: false },
  kotlin: { label: "Kotlin", runnable: false },
  cpp: { label: "C++", runnable: false },
};

export interface DebugSummary {
  id: string;
  title: string;
  language: string;
  level: Difficulty;
  // REVEALED: the learner chose "Show me the answer" (no score).
  status: "OPEN" | "GRADING" | "SUBMITTED" | "REVEALED";
  score: number | null;
  createdAt: string;
}

// "Your challenges" filter: open = not submitted yet (including being marked), done = scored or answer shown.
export type DebugListFilter = "open" | "done";

export interface DebugListResponse {
  challenges: DebugSummary[];
  // The page actually returned (a page past the end comes back as the last one), of `pages`.
  page: number;
  pages: number;
  total: number;
  hasMore: boolean;
  counts: Record<DebugListFilter, number>;
}

export interface DebugChallenge {
  id: string;
  title: string;
  scenario: string;
  // Set when it came from the shared pool, for the "Realistic?" vote.
  poolItemId?: string | null;
  language: string;
  runnable: boolean;
  level: Difficulty;
  buggyCode: string;
  spec: CodeSpec | null;
  status: "OPEN" | "GRADING" | "SUBMITTED" | "REVEALED";
  bugCount: number;
  hints: string[];
  hintsLeft: number;
  result: {
    // Set when the answer was shown instead of submitted: no score, and which bugs were fixed at that point.
    revealed?: boolean;
    fixed?: boolean[];
    bugHints?: (string | null)[];
    score: number | null;
    submittedCode: string;
    explanation: string | null;
    testResults: { passed: number; total: number } | null;
    bugsFixed: number;
    feedback: string;
    missed: string[];
    bugs: string[];
    referenceFix: string;
    // How the score was made; absent on results marked before the rubric (server debug.rubric.ts).
    parts?: { fix: number; explanation: number; quality: number; hints: number };
    reasons?: { fix: string; explanation: string; quality: string };
    toImprove?: ImproveStep[];
  } | null;
  guide: RubricGuide;
}

export interface DesignSummary {
  id: string;
  title: string;
  level: Difficulty;
  status: "OPEN" | "GRADING" | "SUBMITTED";
  score: number | null;
  createdAt: string;
}

export interface DesignChallenge {
  id: string;
  title: string;
  brief: string;
  // Set when it came from the shared pool, for the "Realistic?" vote.
  poolItemId?: string | null;
  level: Difficulty;
  requirements: { functional: string[]; nonFunctional: string[] };
  status: "OPEN" | "GRADING" | "SUBMITTED";
  hints: string[];
  hintsLeft: number;
  // How it's marked (server design.rubric.ts).
  guide: RubricGuide;
  result: {
    score: number;
    diagram: Diagram;
    notes: string;
    // Older results: 1-10 per dimension. Points-marked results have `parts` (points, plus `hints` as a deduction),
    // `reasons` and `toImprove` instead.
    breakdown: { requirements: number; architecture: number; scalability: number; tradeoffs: number } | null;
    parts?: { requirements: number; architecture: number; scalability: number; tradeoffs: number; hints: number };
    reasons?: Record<string, string> | null;
    toImprove?: ImproveStep[];
    strengths: string[];
    gaps: string[];
    feedback: string;
    followUps: string[];
    keyPoints: string[];
    referenceDesign: string;
  } | null;
}

// A score made of parts (server *.rubric.ts): the bands for each part, shown before answering, and the steps that
// would earn the points still missing, shown after.
export interface RubricGuide {
  parts: { key: string; label: string; max: number; bands: readonly string[] }[];
  // Extra rules shown under the parts, e.g. the hint penalty.
  notes?: readonly string[];
}

export interface ImproveStep {
  part: string;
  points: number;
  step: string;
}
