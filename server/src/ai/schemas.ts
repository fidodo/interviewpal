import { z } from "zod";
import { scoreAnswer } from "./answer.rubric";

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,40}$/);

export const codeSpecSchema = z.object({
  functionName: identifier,
  params: z.array(identifier).max(6),
  tests: z.array(z.object({ args: z.array(z.unknown()).max(6), expected: z.unknown() })).min(2).max(8),
});

export const generatedQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["VERBAL", "CODING"]),
  // Extra tagging for role practice; tolerate null, too many or over-long tags instead of rejecting the question.
  skills: z
    .array(z.string())
    .nullish()
    .catch(null)
    .transform((tags) => (tags ?? []).slice(0, 5).map((t) => t.slice(0, 80))),
  // Optional test spec for CODING questions; anything malformed is dropped rather than failing the question.
  code: codeSpecSchema.nullish().catch(null),
});

const dimension = z.number().min(1).max(10).nullish().catch(null);
const list = z.array(z.string());
const part = z.coerce.number();
const reasonText = z.string().nullish().catch(null);

// Points marking (answer.rubric.ts): the marker gives the three parts, a reason each and steps; the total is worked
// out in code. Reasons and steps are nice-to-haves, so a missing or malformed one never fails the grading.
const pointsGrading = z
  .object({
    correctness: part,
    depth: part,
    clarity: part,
    reasons: z
      .object({ correctness: reasonText, depth: reasonText, clarity: reasonText })
      .partial()
      .nullish()
      .catch(null),
    toImprove: z
      .array(z.object({ part: z.string(), step: z.string() }))
      .nullish()
      .catch(null),
    strengths: list,
    weaknesses: list,
    suggestions: list,
  })
  .transform(({ correctness, depth, clarity, reasons, toImprove, ...rest }) => {
    const r = reasons ?? {};
    const { score, points, marking } = scoreAnswer({
      points: { correctness, depth, clarity },
      reasons: { correctness: r.correctness ?? undefined, depth: r.depth ?? undefined, clarity: r.clarity ?? undefined },
      steps: toImprove ?? [],
    });
    return { ...rest, score, breakdown: points, marking };
  });

// The older shape (an overall 1-10 score with 1-10 parts), kept so a model that answers that way still gets the
// answer marked. The breakdown is a nice-to-have: a missing dimension falls back to the overall score.
const legacyGrading = z
  .object({
    score: z.number().min(1).max(10),
    breakdown: z
      .object({ correctness: dimension, clarity: dimension, depth: dimension })
      .nullish()
      .catch(null),
    strengths: list,
    weaknesses: list,
    suggestions: list,
  })
  .transform(({ breakdown, ...rest }) => ({
    ...rest,
    breakdown: {
      correctness: breakdown?.correctness ?? rest.score,
      clarity: breakdown?.clarity ?? rest.score,
      depth: breakdown?.depth ?? rest.score,
    },
    marking: null,
  }));

export const gradingResultSchema = z.union([pointsGrading, legacyGrading]);

export const summaryResultSchema = z.object({
  overallScore: z.number().min(1).max(10),
  assessment: z.string().min(1),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});
