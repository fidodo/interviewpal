import { Difficulty, QuestionType, Track } from "../types";

export interface PriorQA {
  question: string;
  answer: string;
  score?: number;
  questionType?: QuestionType;
}

export interface GeneratedQuestion {
  text: string;
  type: QuestionType;
  // Role practice only: which of the role's skills this question tests.
  skills?: string[];
  // CODING questions that implement a function: lets the answer be run against tests in the browser.
  code?: CodeSpec | null;
}

export interface CodeSpec {
  functionName: string;
  params: string[];
  tests: { args: unknown[]; expected: unknown }[];
}

// Present when the session practises for a target role (see server/src/roles).
export interface RoleContext {
  title: string;
  isTechnical: boolean;
  skills: string[];
  focusSkill?: string | null;
  jobDescription?: string | null;
  // Mock interviews only: extra instructions for this round (see server/src/roles/mock.ts).
  roundInstructions?: string;
}

export interface GradingBreakdown {
  correctness: number;
  clarity: number;
  depth: number;
}

export interface GradingResult {
  score: number;
  breakdown: GradingBreakdown;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface SummaryResult {
  overallScore: number;
  assessment: string;
  strengths: string[];
  improvements: string[];
}

export interface GenerateQuestionParams {
  topic: string;
  track: Track;
  difficulty: Difficulty;
  priorQA: PriorQA[];
  role?: RoleContext;
  persona?: string;
}

export interface GradeAnswerParams {
  question: string;
  transcript: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  // Mock interviews only: how to judge this round (see server/src/roles/mock.ts).
  roundInstructions?: string;
  persona?: string;
  // Runnable coding answers: the browser test run the candidate did before submitting.
  testResults?: { language: string; passed: number; total: number } | null;
}

export interface GenerateSummaryParams {
  topic: string;
  track: Track;
  difficulty: Difficulty;
  priorQA: PriorQA[];
}

export interface AIProvider {
  generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion>;
  gradeAnswer(params: GradeAnswerParams): Promise<GradingResult>;
  generateSummary(params: GenerateSummaryParams): Promise<SummaryResult>;
  // Raw JSON completion for prompts outside the interview flow (e.g. the kids section), which validate with their own zod schemas.
  generateJson(prompt: string): Promise<unknown>;
}
