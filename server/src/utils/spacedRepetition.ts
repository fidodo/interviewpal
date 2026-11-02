// Leitner-style spaced repetition shared by Learn reviews and Terms: moving into box N makes the item due in
// BOX_INTERVAL_DAYS[N] days. Answering correctly in MAX_BOX retires (masters) the item.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];
export const MAX_BOX = 4;

export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

// Fisher-Yates; returns a new array.
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
