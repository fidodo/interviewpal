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
}

export interface GradeAnswerParams {
  question: string;
  transcript: string;
  difficulty: Difficulty;
  questionType: QuestionType;
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
}
