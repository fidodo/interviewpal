import { DIMENSIONS, Dimension, StoryTake } from "./types";

// "What to work on next", worked out in code from the scores (no AI): the weakest area over the last two takes,
// with one concrete tip, plus a note on fillers or hedges when they're frequent.
const TIPS: Record<Dimension, string> = {
  structure: "Say your point in the first sentence, then give the steps in order and end by saying what happened because of it. Write those 3 beats down before you start.",
  clarity: "Swap jargon for plain words, keep one idea per sentence, and say why each detail matters to this audience.",
  specifics: "Add one number, one name or one concrete example: how big, how long, what changed. \"Cut load time from 4s to 1.5s\" beats \"made it faster\".",
  presence: "Say \"I\", not \"we\", for what you did, and state decisions plainly. Drop \"I think\" and \"sort of\" before your main points.",
  delivery: "Pause instead of saying \"um\", and aim for the target length: time a practice run and trim the longest part.",
};

const PER_100_LIMIT = 3;

export interface NextFocus {
  dimension: Dimension;
  label: string;
  average: number;
  tip: string;
  notes: string[];
}

export function nextFocus(takes: StoryTake[]): NextFocus | null {
  const recent = takes.slice(-2);
  if (recent.length === 0) return null;
  const averages = DIMENSIONS.map((d) => ({ ...d, average: recent.reduce((n, t) => n + (t.breakdown?.[d.key] ?? 0), 0) / recent.length }));
  const weakest = averages.reduce((a, b) => (b.average < a.average ? b : a));

  const notes: string[] = [];
  const last = recent[recent.length - 1];
  const words = last.stats?.wordCount ?? 0;
  if (words > 0) {
    const fillers = (last.stats.fillers.count / words) * 100;
    const hedges = (last.stats.hedges.count / words) * 100;
    if (fillers > PER_100_LIMIT) notes.push(`${last.stats.fillers.count} filler words in your last take (${fillers.toFixed(1)} per 100 words). Try a short pause instead.`);
    if (hedges > PER_100_LIMIT) notes.push(`${last.stats.hedges.count} hedges like "I think" or "maybe" (${hedges.toFixed(1)} per 100 words). Say your main points plainly.`);
  }
  return { dimension: weakest.key, label: weakest.label, average: Math.round(weakest.average * 10) / 10, tip: TIPS[weakest.key], notes };
}
