import { z } from "zod";

export const generatedQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["VERBAL", "CODING"]),
});

export const gradingResultSchema = z.object({
  score: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const summaryResultSchema = z.object({
  overallScore: z.number().min(1).max(10),
  assessment: z.string().min(1),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});
