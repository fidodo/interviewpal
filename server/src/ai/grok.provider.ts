import OpenAI from "openai";
import { env } from "../config/env";
import { AIProvider, GenerateQuestionParams, GenerateSummaryParams, GradeAnswerParams, GradingResult, GeneratedQuestion, SummaryResult } from "./provider.interface";
import { questionPrompt, gradingPrompt, summaryPrompt } from "./prompts";
import { generatedQuestionSchema, gradingResultSchema, summaryResultSchema } from "./schemas";

export class GrokProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.xai.apiKey, baseURL: "https://api.x.ai/v1" });
  }

  private async generateJson(prompt: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model: env.xai.model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Grok returned an empty response");
    return JSON.parse(text);
  }

  async generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
    const raw = await this.generateJson(questionPrompt(params));
    return generatedQuestionSchema.parse(raw);
  }

  async gradeAnswer(params: GradeAnswerParams): Promise<GradingResult> {
    const raw = await this.generateJson(gradingPrompt(params));
    return gradingResultSchema.parse(raw);
  }

  async generateSummary(params: GenerateSummaryParams): Promise<SummaryResult> {
    const raw = await this.generateJson(summaryPrompt(params));
    return summaryResultSchema.parse(raw);
  }
}
