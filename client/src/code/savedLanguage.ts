import { RunLanguage } from "./protocol";

// The language the learner last picked for runnable interview answers.
export const LANGUAGE_KEY = "code-lang";

export function savedLanguage(): RunLanguage {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === "javascript" ? "javascript" : "python";
  } catch {
    return "python";
  }
}

export function saveLanguage(language: RunLanguage) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Not remembered; nothing else breaks.
  }
}
