export type TermMode = "RECOGNISE" | "RECALL" | "USE";
export type TermResult = "RIGHT" | "PARTLY" | "WRONG";

export const MODE_LABELS: Record<TermMode, string> = { RECOGNISE: "Recognise", RECALL: "Recall", USE: "Use it" };
export const RESULT_LABELS: Record<TermResult, string> = { RIGHT: "Right", PARTLY: "Partly", WRONG: "Not yet" };

export interface TermsSummary {
  total: number;
  mastered: number;
  due: number;
  newToday: number;
  reviewedToday: number;
}

export interface TermReveal {
  term: string;
  oneLiner: string;
  explanation: string;
  example: string;
  keyPoints: string[];
  confusedWith: string | null;
}

export interface MyTerm extends TermReveal {
  id: string;
  deck: string;
  source: "PRESET" | "AI" | "MANUAL";
  interviewQuestion: string;
  box: number;
  mode: TermMode;
  isNew: boolean;
  mastered: boolean;
  dueAt: string;
}

export interface StarterDeck {
  deck: string;
  terms: number;
  added: number;
}

export interface TermCardData {
  termId: string;
  term: string;
  deck: string;
  box: number;
  mode: TermMode;
  isNew: boolean;
  practisingAhead: boolean;
  options: string[] | null;
  withExample: boolean;
  interviewQuestion: string | null;
}

export interface TermAnswer {
  result: TermResult;
  moved: boolean;
  box: number;
  mastered: boolean;
  nextReviewDays: number | null;
  reveal: TermReveal;
  // AI-marked Recall
  note?: string;
  // Use it
  termAppears?: boolean;
  precision?: number;
  fix?: string;
  modelSentence?: string;
}
