// Mirrors server/src/kids/types.ts and the kids controller's response shapes — keep them in sync manually.

export type LevelEditor = "BLOCKS" | "PYTHON";
export type ChallengeKind = "DRAW" | "TEXT";
export type ChallengeStatus = "OPEN" | "PASSED";
export type HelpRole = "CHILD" | "PAL";

export const AVATARS = ["fox", "owl", "cat", "robot", "rocket", "dino", "unicorn", "panda"] as const;
export type Avatar = (typeof AVATARS)[number];

export interface Child {
  id: string;
  displayName: string;
  age: number;
  avatar: Avatar;
}

export interface Course {
  slug: string;
  title: string;
  subject: string;
  description: string;
  levelCount: number;
}

export interface LevelProgress {
  order: number;
  title: string;
  editor: LevelEditor;
  challengesToPass: number;
  passedCount: number;
  stars: number;
}

export interface Enrollment {
  currentLevel: number;
  passedAtLevel: number;
}

export interface CourseProgress {
  child: Child;
  course: Omit<Course, "levelCount">;
  enrollment: Enrollment;
  levels: LevelProgress[];
  openChallengeId: string | null;
}

export interface Challenge {
  id: string;
  levelOrder: number;
  title: string;
  story: string;
  instructions: string;
  kind: ChallengeKind;
  starterCode: string;
  hasExpectedOutput: boolean;
  status: ChallengeStatus;
}

export interface Attempt {
  id: string;
  code: string;
  output: string;
  passed: boolean;
  stars: number;
  praise: string;
  nextStep: string;
  createdAt: string;
}

export interface HelpMessage {
  id: string;
  role: HelpRole;
  text: string;
  createdAt: string;
}

export interface ChallengeDetail {
  challenge: Challenge;
  level: { order: number; title: string; editor: LevelEditor; toolbox: string[]; challengesToPass: number };
  child: Child;
  course: { slug: string; title: string };
  enrollment: Enrollment;
  attempts: Attempt[];
  messages: HelpMessage[];
}

export interface ActivityChallenge extends Challenge {
  courseTitle: string;
  createdAt: string;
  attempts: { passed: boolean; stars: number; createdAt: string }[];
  messages: HelpMessage[];
}
