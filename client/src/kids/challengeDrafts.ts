// A learner's unfinished work on a challenge, kept in this browser between visits: typed code, the block workspace and
// the answers for input(). Storage can be unavailable (private windows), so every access is guarded.

export const draftKey = (id: string) => `kids-code:${id}`;
export const blocksKey = (id: string) => `kids-blocks:${id}`;
export const answersKey = (id: string) => `kids-input:${id}`;

export function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSaved(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered between visits; nothing else breaks.
  }
}

// "Start over": forget everything saved for this challenge.
export function clearSaved(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
    localStorage.removeItem(blocksKey(id));
    localStorage.removeItem(answersKey(id));
  } catch {
    // Nothing saved.
  }
}
