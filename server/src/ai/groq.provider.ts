import OpenAI from "openai";
import { env } from "../config/env";
import { AIProvider, ChatMessage, ChatOptions, ChatResult, GenerateQuestionParams, GenerateSummaryParams, GradeAnswerParams, GradingResult, GeneratedQuestion, SummaryResult } from "./provider.interface";
import { openaiChat } from "./openaiChat";
import { questionPrompt, gradingPrompt, summaryPrompt } from "./prompts";
import { generatedQuestionSchema, gradingResultSchema, summaryResultSchema } from "./schemas";

export class GroqProvider implements AIProvider {
  private client: OpenAI;

  // `maxRetries` is the SDK's own retry on 429/5xx, which waits as long as Groq's retry-after header says.
  constructor(
    private model = env.groq.model,
    maxRetries = 2
  ) {
    this.client = new OpenAI({ apiKey: env.groq.apiKey, baseURL: "https://api.groq.com/openai/v1", maxRetries });
  }

  async generateJson(prompt: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Groq returned an empty response");
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

  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    // gpt-oss is a reasoning model: keep its thinking short, and leave room for it on top of the answer.
    if (!this.model.includes("gpt-oss")) return openaiChat(this.client, this.model, messages, options);
    return openaiChat(this.client, this.model, messages, { ...options, maxTokens: (options.maxTokens ?? 800) + 1000 }, { reasoning_effort: "low" });
  }
}
