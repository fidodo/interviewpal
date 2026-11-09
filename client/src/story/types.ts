export type StoryKind = "EXPERIENCE" | "EXPLAIN" | "PITCH" | "OWN";

export const STORY_KINDS: { kind: StoryKind; label: string; description: string }[] = [
  { kind: "EXPERIENCE", label: "Personal experience", description: "\"Tell me about a time…\": a real story from your work or life, told with STAR." },
  { kind: "EXPLAIN", label: "Explain a topic", description: "Make a concept clear to a particular audience." },
  { kind: "PITCH", label: "Pitch or opinion", description: "Argue a position or sell an idea." },
  { kind: "OWN", label: "Your own topic", description: "Type anything you want to talk about." },
];

export const KIND_LABELS: Record<StoryKind, string> = Object.fromEntries(STORY_KINDS.map((k) => [k.kind, k.label])) as Record<StoryKind, string>;

export const TARGETS = [60, 120, 180] as const;

export type Dimension = "structure" | "clarity" | "specifics" | "presence" | "delivery";

export const DIMENSIONS: { key: Dimension; label: string; description: string }[] = [
  { key: "structure", label: "Structure", description: "A clear opening, middle and landing" },
  { key: "clarity", label: "Clarity", description: "Easy to follow for this audience" },
  { key: "specifics", label: "Specifics", description: "Concrete details, numbers and examples" },
  { key: "presence", label: "Presence", description: "How you came across: ownership and confidence" },
  { key: "delivery", label: "Delivery", description: "Pace, fillers, hedging and length" },
];

export interface StorySummary {
  id: string;
  kind: StoryKind;
  prompt: string;
  targetSeconds: number;
  takes: number;
  bestScore: number | null;
  round: number;
  // In the story bank, so it's never cleared.
  banked: boolean;
  createdAt: string;
}

export interface TakeStats {
  wordCount: number;
  wpm: number | null;
  durationSec: number;
  timed: boolean;
  fillers: { count: number; words: Record<string, number> };
  hedges: { count: number; phrases: Record<string, number> };
}

export interface StoryTake {
  id: string;
  number: number;
  transcript: string;
  durationSec: number;
  score: number;
  stats: TakeStats;
  breakdown: Record<Dimension, number>;
  strengths: string[];
  improvements: string[];
  cameAcross: string;
  strongerVersion: string;
  outline: string[];
  createdAt: string;
}

export interface Story {
  id: string;
  kind: StoryKind;
  topic: string | null;
  audience: string | null;
  targetSeconds: number;
  prompt: string;
  shape: string[];
  coachingNotes: string[] | null;
  maxTakes: number;
  // Set once the story has been saved to the story bank.
  bankEntryId: string | null;
  // "Practise this story again": 1 for a new story, 2+ for later rounds of the same story.
  round: number;
  continuesFromId: string | null;
  nextRoundId: string | null;
  takes: StoryTake[];
  createdAt: string;
}

// ---- Story bank ----

export interface Competency {
  key: string;
  label: string;
  description: string;
}

export interface CoverageItem extends Competency {
  count: number;
}

export interface BankEntry {
  id: string;
  storyId: string | null;
  title: string;
  summary: string;
  tags: string[];
  bestScore: number | null;
  timesUsed: number;
  lastUsedAt: string | null;
  updatedAt: string;
}

export interface BankSuggestion {
  title: string;
  summary: string;
  tags: string[];
}

export type FitVerdict = "STRONG" | "PARTIAL" | "WEAK" | "NONE";

export interface Fit {
  verdict: FitVerdict;
  reason: string;
  angle: string | null;
  betterId: string | null;
  betterTitle: string | null;
  missing: string | null;
}
