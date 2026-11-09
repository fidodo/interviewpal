import { DIMENSIONS, Dimension, StoryTake } from "./types";

// "What to work on next", worked out in code from the scores (no AI): the weakest area over the last two takes,
// with one concrete tip, plus a note on fillers and hedges when, together, they're over the limit the marker uses.
const TIPS: Record<Dimension, string> = {
  structure: "Say your point in the first sentence, then give the steps in order and end by saying what happened because of it. Write those 3 beats down before you start.",
  clarity: "Swap jargon for plain words, keep one idea per sentence, and say why each detail matters to this audience.",
  specifics: "Add one number, one name or one concrete example: how big, how long, what changed. \"Cut load time from 4s to 1.5s\" beats \"made it faster\".",
  presence: "Say \"I\", not \"we\", for what you did, and state decisions plainly. Drop \"I think\" and \"sort of\" before your main points.",
  delivery: "Pause instead of saying \"um\", and aim for the target length: time a practice run and trim the longest part.",
};

export interface NextFocus {
  dimension: Dimension;
  label: string;
  average: number;
  tip: string;
  notes: string[];
}

export function nextFocus(takes: StoryTake[], fillersLimit: number): NextFocus | null {
  const recent = takes.slice(-2);
  if (recent.length === 0) return null;
  const averages = DIMENSIONS.map((d) => ({ ...d, average: recent.reduce((n, t) => n + (t.breakdown?.[d.key] ?? 0), 0) / recent.length }));
  const weakest = averages.reduce((a, b) => (b.average < a.average ? b : a));

  const notes: string[] = [];
  const last = recent[recent.length - 1];
  if (last.delivery && !last.delivery.fillersOk) {
    const { fillers, hedges } = last.stats;
    notes.push(`${last.delivery.fillersPer100.toFixed(1)} fillers and hedges per 100 words in your last take, over the limit of ${fillersLimit}.`);
    if (fillers.count > 0) notes.push(`${fillers.count} filler word${fillers.count === 1 ? "" : "s"}: try a short pause instead.`);
    if (hedges.count > 0) notes.push(`${hedges.count} hedge${hedges.count === 1 ? "" : "s"} like "I think" or "maybe": say your main points plainly.`);
  }
  return { dimension: weakest.key, label: weakest.label, average: Math.round(weakest.average * 10) / 10, tip: TIPS[weakest.key], notes };
}
