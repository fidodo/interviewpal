export type Track = string;

export const PRESET_TRACKS = ["Frontend", "Backend", "Full-stack", "AI Engineering"] as const;

// SQLite has no native enum support, so Difficulty/SessionStatus are plain String columns
// in schema.prisma. These mirror them for type-safety and zod validation at the app layer.
export const Difficulty = {
  JUNIOR: "JUNIOR",
  INTERMEDIATE: "INTERMEDIATE",
  SENIOR: "SENIOR",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const SessionStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const QuestionType = {
  VERBAL: "VERBAL",
  CODING: "CODING",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];
