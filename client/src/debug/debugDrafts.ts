import { DEBUG_LANGUAGES } from "../types";

// What debug practice keeps in this browser: your in-progress code per exercise (with the original it was edited
// from), and the stack you picked last.

export const draftKey = (id: string) => `debug-code:${id}`;
// The original code a draft was edited from: if the original changes (old one-line exercises are reformatted on
// first open), the draft no longer lines up with it and is dropped.
export const draftBaseKey = (id: string) => `debug-code-base:${id}`;

export function writeDraft(id: string, code: string | null, base?: string) {
  try {
    if (code == null) {
      localStorage.removeItem(draftKey(id));
      localStorage.removeItem(draftBaseKey(id));
    } else {
      localStorage.setItem(draftKey(id), code);
      if (base !== undefined) localStorage.setItem(draftBaseKey(id), base);
    }
  } catch {
    // Not remembered; nothing else breaks.
  }
}

export const isStack = (x: string | null): x is string => !!x && Object.prototype.hasOwnProperty.call(DEBUG_LANGUAGES, x);

// The stack picked last time, so /debug opens on it. JavaScript the first time.
export const STACK_KEY = "debug-language";
export function savedStack() {
  try {
    const saved = localStorage.getItem(STACK_KEY);
    return isStack(saved) ? saved : "javascript";
  } catch {
    return "javascript";
  }
}
export function saveStack(language: string) {
  try {
    localStorage.setItem(STACK_KEY, language);
  } catch {
    // Not remembered; nothing else breaks.
  }
}

export function readDraft(id: string, original: string) {
  try {
    const draft = localStorage.getItem(draftKey(id));
    const base = localStorage.getItem(draftBaseKey(id));
    // Drafts saved before bases were recorded: a one-line draft of what's now multi-line code is stale.
    const stale = base !== null ? base !== original : !!draft && !draft.includes("\n") && original.includes("\n");
    if (stale) {
      writeDraft(id, null);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}
