import { z } from "zod";

// Validation for the AI's JSON. Bounds keep a misbehaving model from storing essays.

export const outlineSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().max(600).default(""),
  lessons: z
    .array(z.object({ title: z.string().trim().min(1).max(120), objective: z.string().trim().min(1).max(400) }))
    .min(3)
    .max(8),
});

const mcqSchema = z.object({
  kind: z.literal("MCQ"),
  prompt: z.string().trim().min(1).max(800),
  options: z.array(z.string().trim().min(1).max(400)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(1000).default(""),
});

const shortSchema = z.object({
  kind: z.literal("SHORT"),
  prompt: z.string().trim().min(1).max(800),
  modelAnswer: z.string().trim().min(1).max(1500),
  explanation: z.string().max(1000).default(""),
});

export const lessonSchema = z.object({
  content: z.string().trim().min(100).max(8000),
  questions: z.array(z.discriminatedUnion("kind", [mcqSchema, shortSchema])).min(2).max(6),
});

export const shortMarkSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1).max(1000),
});
