import { z } from "zod";

// Validation for the AI's JSON responses. Bounds keep a misbehaving model from storing essays.

export const generatedChallengeSchema = z.object({
  title: z.string().min(1).max(120),
  story: z.string().min(1).max(600),
  instructions: z.string().min(1).max(1500),
  kind: z.enum(["DRAW", "TEXT"]),
  starterCode: z.string().max(3000).default(""),
  expectedOutput: z.string().max(3000).nullish(),
  sampleInput: z.string().max(1000).nullish(),
});
export type GeneratedChallenge = z.infer<typeof generatedChallengeSchema>;

export const reviewResultSchema = z.object({
  passed: z.boolean(),
  stars: z.number().transform((n) => Math.min(3, Math.max(1, Math.round(n)))),
  praise: z.string().min(1).max(600),
  nextStep: z.string().max(600).default(""),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const helpReplySchema = z.object({
  reply: z.string().min(1).max(1200),
});
