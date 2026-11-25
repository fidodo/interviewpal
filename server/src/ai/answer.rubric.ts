// How an interview answer is scored (practice, retakes and mock answers): named parts worth points that add up to
// 10. One source for the marker's prompt and the "How it's marked" card. The marker gives the parts; the total, the
// test-run cap and the points each improvement step is worth are worked out here.

export const ANSWER_PART_MAX = { correctness: 5, depth: 3, clarity: 2 } as const;
export type AnswerPart = keyof typeof ANSWER_PART_MAX;
export type AnswerPoints = Record<AnswerPart, number>;
export const ANSWER_PARTS = Object.keys(ANSWER_PART_MAX) as AnswerPart[];

// Stored in Feedback.marking (and in a retake's feedback JSON) so new answers are told apart from old 1-10 ones.
export const ANSWER_SCHEME = "points-v1";

// Kept to one short line per band: short anchors mark more consistently than long rubric prose.
export const ANSWER_GUIDE = {
  parts: [
    {
      key: "correctness",
      label: "Correctness",
      max: ANSWER_PART_MAX.correctness,
      bands: [
        "0: wrong, or doesn't answer the question.",
        "1-2: partly right, with a significant error or a big gap.",
        "3-4: right on the main point, with a small error or something missing.",
        "5: accurate and complete for the level. A coding answer whose tests ran needs every test passing.",
      ],
    },
    {
      key: "depth",
      label: "Depth",
      max: ANSWER_PART_MAX.depth,
      bands: [
        "0: only a definition or a restated question.",
        "1: explains how or why it works.",
        "2: adds a trade-off, an edge case or a real example.",
        "3: trade-offs and edge cases with an example, or when you'd choose otherwise.",
      ],
    },
    {
      key: "clarity",
      label: "Clarity",
      max: ANSWER_PART_MAX.clarity,
      bands: ["0: hard to follow.", "1: understandable, but rambles or jumps around.", "2: answer first, then a clear order; easy to follow aloud."],
    },
  ],
  notes: ["The score is the three parts added up, never below 1. The level you picked sets how much is expected."],
} as const;

// The bands as plain lines, for the marker's prompt.
export function answerGuideForPrompt(): string {
  return ANSWER_GUIDE.parts.map((p) => `"${p.key}" (0-${p.max}), ${p.label}:\n${p.bands.map((b) => `  ${b}`).join("\n")}`).join("\n");
}

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

export interface AnswerStep {
  part: AnswerPart;
  points: number;
  step: string;
}

export interface AnswerMarking {
  scheme: typeof ANSWER_SCHEME;
  reasons: Partial<Record<AnswerPart, string>>;
  toImprove: AnswerStep[];
}

// The marker's parts, made final: clamped to each part's range, correctness held below full marks while a test run
// failed, and the total worked out (at least 1). The steps get their points from what each part is missing (never
// from the model); a failing test run always gets a step. At most 3, biggest gain first.
export function scoreAnswer(
  raw: { points: AnswerPoints; reasons: Partial<Record<AnswerPart, string>>; steps: { part: string; step: string }[] },
  testResults?: { passed: number; total: number } | null
): { score: number; points: AnswerPoints; marking: AnswerMarking } {
  const points: AnswerPoints = {
    correctness: clamp(raw.points.correctness, ANSWER_PART_MAX.correctness),
    depth: clamp(raw.points.depth, ANSWER_PART_MAX.depth),
    clarity: clamp(raw.points.clarity, ANSWER_PART_MAX.clarity),
  };
  const failing = !!testResults && testResults.total > 0 && testResults.passed < testResults.total;
  if (failing) points.correctness = Math.min(points.correctness, ANSWER_PART_MAX.correctness - 1);
  const score = Math.max(1, points.correctness + points.depth + points.clarity);

  const missing = (part: AnswerPart) => ANSWER_PART_MAX[part] - points[part];
  const written = raw.steps.filter((s): s is { part: AnswerPart; step: string } => (ANSWER_PARTS as string[]).includes(s.part) && !!s.step.trim());
  if (failing && !written.some((s) => s.part === "correctness")) {
    written.unshift({ part: "correctness", step: `Make every test pass (${testResults!.passed} of ${testResults!.total} passed).` });
  }
  const seen = new Set<string>();
  const toImprove = written
    .filter((s) => missing(s.part) > 0 && !seen.has(s.part) && seen.add(s.part))
    .map((s) => ({ part: s.part, points: missing(s.part), step: s.step.trim().slice(0, 300) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const reasons: Partial<Record<AnswerPart, string>> = {};
  for (const part of ANSWER_PARTS) {
    const r = raw.reasons[part]?.trim();
    if (r) reasons[part] = r.slice(0, 400);
  }
  return { score, points, marking: { scheme: ANSWER_SCHEME, reasons, toImprove } };
}
