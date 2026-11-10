// The four story kinds, plus the 1-minute drills (server/src/story/story.drills.ts).
export type DrillKind = "ANSWER_FIRST" | "INTRO" | "IMPROMPTU" | "NO_FILLER" | "PAUSE";
export type StoryKind = "EXPERIENCE" | "EXPLAIN" | "PITCH" | "OWN" | "CONVERSATION" | DrillKind;

// One line of a Speak conversation: yours, or the other person's (played by the AI).
export interface Turn {
  role: "you" | "them";
  text: string;
}

// Ready-made conversation scenarios for the Speak form (or describe your own).
export const CONVERSATION_SCENARIOS = [
  {
    key: "warmup",
    label: "Interview warm-up",
    topic: "The first minutes of a job interview: small talk, then \"tell me about yourself\", then follow-up questions on the answer",
    audience: "a friendly hiring manager",
  },
  { key: "networking", label: "Networking", topic: "Meeting someone new at a tech meetup and getting to know what they work on", audience: "a senior engineer at a meetup" },
  {
    key: "pushback",
    label: "Pushback",
    topic: "An interviewer who questions and pushes back on the candidate's answers about a past project",
    audience: "a sceptical senior interviewer",
  },
] as const;

export const STORY_KINDS: { kind: Exclude<StoryKind, DrillKind>; label: string; description: string }[] = [
  { kind: "EXPERIENCE", label: "Personal experience", description: "\"Tell me about a time…\": a real story from your work or life, told with STAR." },
  { kind: "EXPLAIN", label: "Explain a topic", description: "Make a concept clear to a particular audience." },
  { kind: "PITCH", label: "Pitch or opinion", description: "Argue a position or sell an idea." },
  { kind: "OWN", label: "Your own topic", description: "Type anything you want to talk about." },
  { kind: "CONVERSATION", label: "Conversation", description: "The AI plays the other person and replies to what you say, for up to 6 turns." },
];

export const KIND_LABELS: Record<StoryKind, string> = {
  ...(Object.fromEntries(STORY_KINDS.map((k) => [k.kind, k.label])) as Record<Exclude<StoryKind, DrillKind>, string>),
  ANSWER_FIRST: "Drill: answer first",
  INTRO: "Drill: tell me about yourself",
  IMPROMPTU: "Drill: impromptu",
  NO_FILLER: "Drill: no-filler minute",
  PAUSE: "Drill: pause on purpose",
};

// A 1-minute drill as listed on /speak (from the server).
export interface DrillInfo {
  kind: DrillKind;
  label: string;
  description: string;
  targetSeconds: number;
  focus: Dimension;
}

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

// Measured in this browser from the recording (audio/analyzeVoice.ts); null for typed takes and older takes.
export interface VoiceStats {
  speakingSec: number;
  pauses: { count: number; perMinute: number; averageSec: number; longestSec: number; longCount: number };
  pitchRangeSemitones: number | null;
  phrases: number;
  trailOffShare: number | null;
}

export interface TakeStats {
  voice?: VoiceStats | null;
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
  // Length and fillers against the targets, worked out on the server the same way as for the marker.
  delivery: { lengthPercent: number; length: "short" | "on" | "long"; fillersPer100: number; fillersOk: boolean } | null;
  // Why each dimension got its score, from the marker. Null for takes marked before this was added.
  reasons: Partial<Record<Dimension, string>> | null;
  createdAt: string;
}

// What each score means: the same guide the marker uses (server/src/story/story.rubric.ts).
export interface ScoreGuideData {
  bands: { min: number; max: number; label: string }[];
  dimensions: { key: Dimension; label: string; bands: string[] }[];
  overall: string;
  deliveryTargets: { wpm: [number, number]; lengthShare: [number, number]; fillersPer100: number };
}

// A speaking framework cheat sheet (server/src/story/story.frameworks.ts).
export interface Framework {
  key: string;
  name: string;
  use: string;
  steps: string[];
  template: string;
  example: string;
  mistake: string;
}

export interface Story {
  id: string;
  kind: StoryKind;
  topic: string | null;
  audience: string | null;
  targetSeconds: number;
  prompt: string;
  shape: string[];
  // The kind's framework, and the keys of others that also fit.
  framework: { main: Framework; also: { key: string; name: string }[] };
  // Set for a conversation: how many turns you get, and how many before feedback.
  conversation: { maxTurns: number; minTurns: number } | null;
  // Set for a 1-minute drill: its name and the dimension it trains.
  drill: { label: string; focus: Dimension } | null;
  coachingNotes: string[] | null;
  maxTakes: number;
  // Set once the story has been saved to the story bank.
  bankEntryId: string | null;
  // "Practise this story again": 1 for a new story, 2+ for later rounds of the same story.
  round: number;
  continuesFromId: string | null;
  nextRoundId: string | null;
  takes: StoryTake[];
  guide: ScoreGuideData;
  // What the voice figures mean (server/src/story/story.prompts.ts VOICE_TARGETS).
  voiceTargets: VoiceTargets;
  createdAt: string;
}

export interface VoiceTargets {
  flatBelowSemitones: number;
  livelyFromSemitones: number;
  trailOffShare: number;
  longPauseSec: number;
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
