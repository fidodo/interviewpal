import OpenAI from "openai";
import { env } from "../config/env";
import { AIProvider, ChatMessage, ChatOptions, ChatResult, GenerateQuestionParams, GenerateSummaryParams, GradeAnswerParams, GradingResult, GeneratedQuestion, SummaryResult } from "./provider.interface";
import { questionPrompt, gradingPrompt, summaryPrompt } from "./prompts";
import { generatedQuestionSchema, gradingResultSchema, summaryResultSchema } from "./schemas";

// Mistral (La Plateforme) through its OpenAI-compatible endpoint. Its API rejects OpenAI-only parameters such as
// `max_completion_tokens`, so chat sets `max_tokens` itself rather than using the shared openaiChat.
// Free mode limits differ per model (checked 2026-11-09 from the x-ratelimit headers): mistral-large-4 gets 50
// requests a minute and 20,000 tokens a minute, the Ministral models 2 a minute, and Small/Medium 0.

// Reasoning models (mistral-large-4, magistral) return `content` as chunks: [{type:"thinking",…}, {type:"text",text}].
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: string; text: string } => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}
export class MistralProvider implements AIProvider {
  private client: OpenAI;

  constructor(
    private model = env.mistral.model,
    maxRetries = 2
  ) {
    this.client = new OpenAI({ apiKey: env.mistral.apiKey, baseURL: "https://api.mistral.ai/v1", maxRetries });
  }

  async generateJson(prompt: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = textOf(response.choices[0]?.message?.content);
    if (!text) throw new Error("Mistral returned an empty response");
    return JSON.parse(text);
  }

  async generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
    return generatedQuestionSchema.parse(await this.generateJson(questionPrompt(params)));
  }

  async gradeAnswer(params: GradeAnswerParams): Promise<GradingResult> {
    return gradingResultSchema.parse(await this.generateJson(gradingPrompt(params)));
  }

  async generateSummary(params: GenerateSummaryParams): Promise<SummaryResult> {
    return summaryResultSchema.parse(await this.generateJson(summaryPrompt(params)));
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      // Reasoning models count their thinking in max_tokens; leave room for it on top of the answer (as Groq's gpt-oss).
      max_tokens: (options.maxTokens ?? 800) + (/large-4|magistral/.test(this.model) ? 1000 : 0),
      ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    return {
      text: textOf(response.choices[0]?.message?.content),
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
    };
  }
}
