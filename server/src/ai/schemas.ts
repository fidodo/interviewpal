import { z } from "zod";

export const generatedQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["VERBAL", "CODING"]),
  // Extra tagging for role practice; tolerate null, too many or over-long tags instead of rejecting the question.
  skills: z
    .array(z.string())
    .nullish()
    .catch(null)
    .transform((tags) => (tags ?? []).slice(0, 5).map((t) => t.slice(0, 80))),
});

const dimension = z.number().min(1).max(10).nullish().catch(null);

// The overall score is required. The breakdown is a nice-to-have that models sometimes leave incomplete, so a
// missing dimension falls back to the overall score instead of failing the whole grading.
export const gradingResultSchema = z
  .object({
    score: z.number().min(1).max(10),
    breakdown: z
      .object({ correctness: dimension, clarity: dimension, depth: dimension })
      .nullish()
      .catch(null),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    suggestions: z.array(z.string()),
  })
  .transform(({ breakdown, ...rest }) => ({
    ...rest,
    breakdown: {
      correctness: breakdown?.correctness ?? rest.score,
      clarity: breakdown?.clarity ?? rest.score,
      depth: breakdown?.depth ?? rest.score,
    },
  }));

export const summaryResultSchema = z.object({
  overallScore: z.number().min(1).max(10),
  assessment: z.string().min(1),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});
