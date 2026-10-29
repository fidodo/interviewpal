import { z } from "zod";

// Validation for the AI's JSON. Bounds keep a misbehaving model from storing essays.

export const generatedSkillsSchema = z.object({
  isTechnical: z.boolean(),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        category: z.enum(["TECHNICAL", "DOMAIN", "BEHAVIOURAL"]),
        importance: z.number().transform((n) => Math.min(3, Math.max(1, Math.round(n)))),
        description: z.string().max(600).default(""),
        suggestedRating: z
          .number()
          .nullish()
          .transform((n) => (n == null ? null : Math.min(5, Math.max(1, Math.round(n))))),
      })
    )
    .min(3)
    .max(15),
});

export const generatedGoalsSchema = z.object({
  goals: z
    .array(z.object({ skill: z.string().max(80), text: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(5),
});
