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

// Phrases that undercut how sure the speaker sounds. "sort of"/"kind of" are counted as fillers above, so they're
// left out here to avoid counting them twice.
const HEDGE_PHRASES = [
  "i think", "i guess", "i suppose", "i feel like", "i'm not sure", "i don't know",
  "maybe", "perhaps", "probably", "a little bit", "somewhat", "hopefully",
];

export interface HedgeStats {
  count: number;
  phrases: Record<string, number>;
}

// Pure string analysis, like analyzeFillers: free and instant.
export function analyzeHedges(transcript: string): HedgeStats {
  const normalized = transcript.toLowerCase().replace(/[’]/g, "'");
  const phrases: Record<string, number> = {};
  let count = 0;
  for (const phrase of HEDGE_PHRASES) {
    const matches = normalized.match(new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g"));
    if (matches?.length) {
      phrases[phrase] = matches.length;
      count += matches.length;
    }
  }
  return { count, phrases };
}
