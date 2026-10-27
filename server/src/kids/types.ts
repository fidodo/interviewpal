// Mirrored manually in client/src/kids/types.ts — keep the two in sync.

export const LevelEditor = {
  BLOCKS: "BLOCKS",
  PYTHON: "PYTHON",
} as const;
export type LevelEditor = (typeof LevelEditor)[keyof typeof LevelEditor];

export const ChallengeKind = {
  DRAW: "DRAW",
  TEXT: "TEXT",
} as const;
export type ChallengeKind = (typeof ChallengeKind)[keyof typeof ChallengeKind];

export const ChallengeStatus = {
  OPEN: "OPEN",
  PASSED: "PASSED",
} as const;
export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus];

export const HelpRole = {
  CHILD: "CHILD",
  PAL: "PAL",
} as const;
export type HelpRole = (typeof HelpRole)[keyof typeof HelpRole];

export const AVATARS = ["fox", "owl", "cat", "robot", "rocket", "dino", "unicorn", "panda"] as const;
export type Avatar = (typeof AVATARS)[number];
