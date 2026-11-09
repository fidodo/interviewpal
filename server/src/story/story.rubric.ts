// What each Speak score means. One source for both the marker (storyGradePrompt) and the "What a good score looks
// like" guide on the story page, which gets it in the story response.

export const DIMENSION_KEYS = ["structure", "clarity", "specifics", "presence", "delivery"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const BANDS = [
  { min: 1, max: 3, label: "Needs work" },
  { min: 4, max: 6, label: "Getting there" },
  { min: 7, max: 8, label: "Strong" },
  { min: 9, max: 10, label: "Excellent" },
] as const;

// One description per band, in BANDS order.
export const RUBRIC: Record<DimensionKey, { label: string; bands: [string, string, string, string] }> = {
  structure: {
    label: "Structure",
    bands: [
      "No clear point or order; it's hard to tell where the story is going or how it ended.",
      "The parts are there, but out of order or uneven: a long set-up, or a rushed or missing result.",
      "Follows the suggested shape: a clear opening, the steps in order, and a landing with the result.",
      "The first sentence says what it's about, every part earns its place, and it ends on the result and the lesson.",
    ],
  },
  clarity: {
    label: "Clarity",
    bands: [
      "Hard to follow: ideas jump around, sentences trail off, or terms aren't explained.",
      "Mostly followable, but with long tangled sentences, repetition, or jargon this audience wouldn't know.",
      "Easy to follow the first time: one idea per sentence, in words suited to the audience.",
      "Effortless to follow: complex parts are made simple, and each point leads to the next.",
    ],
  },
  specifics: {
    label: "Specifics",
    bands: [
      "General statements only (\"I worked hard\", \"it went well\"), with no names, numbers or examples.",
      "Some detail, but the key facts are vague: what exactly you did, how big, how long, what changed.",
      "Concrete throughout: what you did, the tools or people involved, and at least one number or measurable result.",
      "Numbers, names and a before-and-after that make the impact clear.",
    ],
  },
  presence: {
    label: "Presence",
    bands: [
      "Your own role is unclear (\"we\" throughout) or the answer is heavily hedged, and the stakes are missing.",
      "Some ownership, but hedges (\"I think\", \"maybe\") or a flat telling undercut the main points.",
      "Says \"I\" for your own actions, states decisions plainly, and makes clear why it mattered.",
      "Confident and credible throughout.",
    ],
  },
  delivery: {
    label: "Delivery",
    bands: [
      "Under half or well over the target length, or fillers and hedges in most sentences.",
      "Outside 80-110% of the target length, or 3 or more fillers and hedges per 100 words.",
      "Within 80-110% of the target length, with under 3 fillers and hedges per 100 words.",
      "On time and steady, with almost no fillers or hedges.",
    ],
  },
};

export const OVERALL_NOTE =
  "The overall score isn't an average: a story with no clear point or no result can't score above about 5, however well it's delivered.";

// Measured in code (transcriptAnalysis.ts); the marker is told to score delivery against these.
export const DELIVERY_TARGETS = { wpm: [130, 160] as [number, number], lengthShare: [0.8, 1.1] as [number, number], fillersPer100: 3 };

// The guide as sent to the client (static, so built once).
export const SCORE_GUIDE = {
  bands: BANDS,
  dimensions: DIMENSION_KEYS.map((key) => ({ key, label: RUBRIC[key].label, bands: RUBRIC[key].bands })),
  overall: OVERALL_NOTE,
  deliveryTargets: DELIVERY_TARGETS,
};

// A take's delivery against DELIVERY_TARGETS: worked out once here for both the marker (which gets the arithmetic
// wrong) and the take shown on the page. Fillers and hedges count together.
export function deliveryCheck(stats: { durationSec: number; wordCount: number; fillers: { count: number }; hedges: { count: number } }, targetSeconds: number) {
  const lengthPercent = Math.round((stats.durationSec / targetSeconds) * 100);
  const [low, high] = DELIVERY_TARGETS.lengthShare.map((n) => Math.round(n * 100));
  const per100 = stats.wordCount ? Math.round(((stats.fillers.count + stats.hedges.count) / stats.wordCount) * 1000) / 10 : 0;
  return {
    lengthPercent,
    length: lengthPercent < low ? ("short" as const) : lengthPercent > high ? ("long" as const) : ("on" as const),
    fillersPer100: per100,
    fillersOk: per100 < DELIVERY_TARGETS.fillersPer100,
  };
}

// The guide as written into the marking prompt.
export function rubricForPrompt() {
  return DIMENSION_KEYS.map(
    (key) => `- ${key}:\n${BANDS.map((b, i) => `  ${b.min}-${b.max}: ${RUBRIC[key].bands[i]}`).join("\n")}`
  ).join("\n");
}
