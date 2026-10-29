import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { AIProvider, GenerateQuestionParams, GenerateSummaryParams, GradeAnswerParams, GradingResult, GeneratedQuestion, SummaryResult } from "./provider.interface";
import { questionPrompt, gradingPrompt, summaryPrompt } from "./prompts";
import { generatedQuestionSchema, gradingResultSchema, summaryResultSchema } from "./schemas";

const QUESTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
    type: { type: "STRING", enum: ["VERBAL", "CODING"] },
    skills: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["text", "type"],
};

const GRADING_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "NUMBER" },
    breakdown: {
      type: "OBJECT",
      properties: {
        correctness: { type: "NUMBER" },
        clarity: { type: "NUMBER" },
        depth: { type: "NUMBER" },
      },
      required: ["correctness", "clarity", "depth"],
    },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    weaknesses: { type: "ARRAY", items: { type: "STRING" } },
    suggestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["score", "breakdown", "strengths", "weaknesses", "suggestions"],
};

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    overallScore: { type: "NUMBER" },
    assessment: { type: "STRING" },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    improvements: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["overallScore", "assessment", "strengths", "improvements"],
};

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }

  async generateJson(prompt: string, schema?: object): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: env.gemini.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        ...(schema ? { responseSchema: schema } : {}),
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini returned an empty response");
    return JSON.parse(text);
  }

  async generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
    const raw = await this.generateJson(questionPrompt(params), QUESTION_SCHEMA);
    return generatedQuestionSchema.parse(raw);
  }

  async gradeAnswer(params: GradeAnswerParams): Promise<GradingResult> {
    const raw = await this.generateJson(gradingPrompt(params), GRADING_SCHEMA);
    return gradingResultSchema.parse(raw);
  }

  async generateSummary(params: GenerateSummaryParams): Promise<SummaryResult> {
    const raw = await this.generateJson(summaryPrompt(params), SUMMARY_SCHEMA);
    return summaryResultSchema.parse(raw);
  }
}
