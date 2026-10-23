const FILLER_PHRASES = [
  "um", "umm", "uh", "uhh", "er", "erm",
  "like", "you know", "sort of", "kind of",
  "basically", "actually", "literally", "i mean",
];

export interface FillerStats {
  count: number;
  words: Record<string, number>;
  wordCount: number;
}

// Pure string analysis on a VERBAL transcript — no AI call, so it's free and instant.
// Doesn't apply to CODING answers (typed code, not speech).
export function analyzeFillers(transcript: string): FillerStats {
  const normalized = transcript.toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const words: Record<string, number> = {};
  let count = 0;

  for (const phrase of FILLER_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g");
    const matches = normalized.match(pattern);
    if (matches && matches.length > 0) {
      words[phrase] = matches.length;
      count += matches.length;
    }
  }

  return { count, words, wordCount };
}
