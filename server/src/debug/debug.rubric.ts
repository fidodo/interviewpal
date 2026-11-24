// How a debug fix is scored: named parts worth points that add up to 10. One source for the marker's prompt and for
// the "How it's marked" card. The parts code can decide (fix, hints, the total) are worked out here; the AI only
// marks the explanation and the fix quality, against the short bands below.

export const PART_MAX = { fix: 5, explanation: 3, quality: 2 } as const;
export type DebugPart = keyof typeof PART_MAX;

export interface DebugParts {
  fix: number;
  explanation: number;
  quality: number;
  // Points taken off for hints (0 or negative).
  hints: number;
}

export const HINT_PENALTY = 1;

// Kept to one short line per band: short anchors mark more consistently than long rubric prose.
export const DEBUG_GUIDE = {
  parts: [
    {
      key: "fix",
      label: "Fix",
      max: PART_MAX.fix,
      bands: ["Points for the share of planted bugs you fixed.", "Runnable code: 5 needs every test passing (otherwise at most 4)."],
    },
    {
      key: "explanation",
      label: "Explanation",
      max: PART_MAX.explanation,
      bands: [
        "0: no explanation.",
        "1: says what you changed.",
        "2: names each bug's root cause.",
        "3: root cause, why it caused the reported symptom, and an input or test that would catch it.",
      ],
    },
    {
      key: "quality",
      label: "Fix quality",
      max: PART_MAX.quality,
      bands: [
        "0: the change adds a new problem.",
        "1: works, but rewrites more than needed or leaves a related edge case.",
        "2: a targeted fix that breaks nothing else and covers the edge case behind the bug.",
      ],
    },
  ],
  notes: [`Each hint takes off ${HINT_PENALTY} point.`, "The score is never below 1."],
} as const;

// Fix points come from facts, not the model: the share of bugs fixed, capped below full marks while any test fails.
export function fixPoints(bugsFixed: number, bugCount: number, testResults: { passed: number; total: number } | null): number {
  if (bugCount <= 0) return 0;
  const share = Math.min(Math.max(bugsFixed, 0), bugCount) / bugCount;
  const points = Math.round(PART_MAX.fix * share);
  const allTestsPass = !testResults || testResults.passed >= testResults.total;
  return allTestsPass ? points : Math.min(points, PART_MAX.fix - 1);
}

export function scoreParts(p: { fix: number; explanation: number; quality: number; hintsUsed: number }): { parts: DebugParts; score: number } {
  const parts: DebugParts = {
    fix: clampPart(p.fix, PART_MAX.fix),
    explanation: clampPart(p.explanation, PART_MAX.explanation),
    quality: clampPart(p.quality, PART_MAX.quality),
    hints: -HINT_PENALTY * Math.max(0, p.hintsUsed),
  };
  const total = parts.fix + parts.explanation + parts.quality + parts.hints;
  return { parts, score: Math.min(10, Math.max(1, total)) };
}

export interface ImproveStep {
  part: DebugPart | "hints";
  points: number;
  step: string;
}

// The marker writes the steps; the points each is worth come from the parts here, so "+2" is always what's actually
// missing. One step per part that lost points, biggest gain first, at most 3. The parts code decides (fix, hints)
// always get a step, from `fallback` when the marker didn't write one.
export function improvementSteps(
  parts: DebugParts,
  steps: { part: DebugPart | "hints"; step: string }[],
  fallback: Partial<Record<DebugPart | "hints", string>> = {}
): ImproveStep[] {
  const missing = (part: DebugPart | "hints") => (part === "hints" ? -parts.hints : PART_MAX[part] - parts[part]);
  const extra = (Object.entries(fallback) as [DebugPart | "hints", string | undefined][]).filter((e): e is [DebugPart | "hints", string] => !!e[1]);
  const all = [...steps, ...extra.map(([part, step]) => ({ part, step }))];
  const seen = new Set<string>();
  return all
    .filter((s) => missing(s.part) > 0 && !seen.has(s.part) && seen.add(s.part))
    .map((s) => ({ part: s.part, points: missing(s.part), step: s.step }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
}

// The steps for the parts worked out in code, used when the marker didn't write its own.
export function factSteps(p: { bugsFixed: number; bugCount: number; testResults: { passed: number; total: number } | null }) {
  const left = p.bugCount - Math.min(p.bugsFixed, p.bugCount);
  const failing = p.testResults && p.testResults.passed < p.testResults.total;
  return {
    fix: left > 0 ? `Fix the ${left === 1 ? "bug" : `${left} bugs`} still in the code${failing ? ", until every test passes" : ""}.` : failing ? "Make every test pass." : undefined,
    hints: "Solve the next one without hints.",
  };
}

function clampPart(n: number, max: number) {
  return Math.min(max, Math.max(0, Math.round(n)));
}

// The bands as plain lines, for the marker's prompt.
export function guideForPrompt(): string {
  return DEBUG_GUIDE.parts
    .filter((p) => p.key !== "fix")
    .map((p) => `"${p.key}" (0-${p.max}), ${p.label}:\n${p.bands.map((b) => `  ${b}`).join("\n")}`)
    .join("\n");
}
