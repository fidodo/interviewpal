// A starter-deck term, written by hand. Recognise options for starter decks come from the other terms in the same
// deck, so these need no stored distractors.
export interface PresetTerm {
  term: string;
  oneLiner: string;
  explanation: string;
  example: string;
  keyPoints: string[];
  confusedWith: string | null;
  interviewQuestion: string;
}

export interface PresetDeck {
  // Matches a PRESET_TRACKS name (server/src/types.ts).
  deck: string;
  slug: string;
  terms: PresetTerm[];
}

export const t = (
  term: string,
  oneLiner: string,
  explanation: string,
  example: string,
  keyPoints: string[],
  confusedWith: string | null,
  interviewQuestion: string
): PresetTerm => ({ term, oneLiner, explanation, example, keyPoints, confusedWith, interviewQuestion });
