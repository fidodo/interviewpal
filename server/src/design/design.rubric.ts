// How a system design answer is scored: named parts worth points that add up to 10, minus hints. One source for the
// marker's prompt and the "How it's marked" card. The marker gives the parts; the hint deduction, the total and the
// points each improvement step is worth are worked out here.

export const DESIGN_PART_MAX = { requirements: 3, architecture: 3, scalability: 2, tradeoffs: 2 } as const;
export type DesignPart = keyof typeof DESIGN_PART_MAX;
export const DESIGN_PARTS = Object.keys(DESIGN_PART_MAX) as DesignPart[];

export interface DesignParts extends Record<DesignPart, number> {
  // Points taken off for hints (0 or negative).
  hints: number;
}

// Kept to one short line per band: short anchors mark more consistently than long rubric prose.
export const DESIGN_GUIDE = {
  parts: [
    {
      key: "requirements",
      label: "Requirements",
      max: DESIGN_PART_MAX.requirements,
      bands: [
        "0: the design doesn't do what was asked.",
        "1: covers some functional requirements.",
        "2: every functional requirement, and some non-functional ones.",
        "3: every requirement, with the numbers (scale, latency) used to size the design.",
      ],
    },
    {
      key: "architecture",
      label: "Architecture",
      max: DESIGN_PART_MAX.architecture,
      bands: [
        "0: no clear components or data flow.",
        "1: the main components, but the data flow or storage is unclear.",
        "2: sensible components and data flow, with a fitting data model.",
        "3: that, plus the API and how a request moves through each part.",
      ],
    },
    {
      key: "scalability",
      label: "Scalability and reliability",
      max: DESIGN_PART_MAX.scalability,
      bands: [
        "0: not addressed.",
        "1: names a bottleneck or adds caching or replicas without saying why.",
        "2: finds the bottleneck at the scale asked, and covers caching or partitioning and what happens when a part fails.",
      ],
    },
    {
      key: "tradeoffs",
      label: "Trade-offs",
      max: DESIGN_PART_MAX.tradeoffs,
      bands: ["0: choices aren't explained.", "1: explains a choice.", "2: explains choices and what each gives up, or when you'd pick the alternative."],
    },
  ],
  notes: ["Hints take off half a point each, rounded up (1 or 2 hints: 1 point).", "The score is never below 1."],
} as const;

export function hintDeduction(hintsUsed: number) {
  return -Math.ceil(Math.max(0, hintsUsed) / 2);
}

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

export interface DesignStep {
  part: DesignPart | "hints";
  points: number;
  step: string;
}

// The marker's parts made final: clamped, the hint deduction applied, the total (at least 1), and the steps with
// the points each part is missing (never the model's numbers). Hints always get a step when they cost points.
export function scoreDesign(
  raw: Record<DesignPart, number>,
  hintsUsed: number,
  steps: { part: string; step: string }[]
): { parts: DesignParts; score: number; toImprove: DesignStep[] } {
  const parts = {
    requirements: clamp(raw.requirements, DESIGN_PART_MAX.requirements),
    architecture: clamp(raw.architecture, DESIGN_PART_MAX.architecture),
    scalability: clamp(raw.scalability, DESIGN_PART_MAX.scalability),
    tradeoffs: clamp(raw.tradeoffs, DESIGN_PART_MAX.tradeoffs),
    hints: hintDeduction(hintsUsed),
  };
  const total = DESIGN_PARTS.reduce((n, p) => n + parts[p], 0) + parts.hints;
  const score = Math.min(10, Math.max(1, total));

  const missing = (part: DesignPart | "hints") => (part === "hints" ? -parts.hints : DESIGN_PART_MAX[part] - parts[part]);
  const written = steps.filter((s): s is { part: DesignPart; step: string } => (DESIGN_PARTS as string[]).includes(s.part) && !!s.step.trim());
  const all: { part: DesignPart | "hints"; step: string }[] = [...written];
  if (parts.hints < 0) all.push({ part: "hints", step: "Try the next one without hints." });
  const seen = new Set<string>();
  const toImprove = all
    .filter((s) => missing(s.part) > 0 && !seen.has(s.part) && seen.add(s.part))
    .map((s) => ({ part: s.part, points: missing(s.part), step: s.step.trim().slice(0, 300) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  return { parts, score, toImprove };
}

// The bands as plain lines, for the marker's prompt.
export function designGuideForPrompt(): string {
  return DESIGN_GUIDE.parts.map((p) => `"${p.key}" (0-${p.max}), ${p.label}:\n${p.bands.map((b) => `  ${b}`).join("\n")}`).join("\n");
}
