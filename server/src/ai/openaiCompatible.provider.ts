import OpenAI from "openai";
import { AIProvider, ChatMessage, ChatOptions, ChatResult, GenerateQuestionParams, GenerateSummaryParams, GradeAnswerParams, GradingResult, GeneratedQuestion, SummaryResult } from "./provider.interface";
import { openaiChat } from "./openaiChat";
import { questionPrompt, gradingPrompt, summaryPrompt } from "./prompts";
import { generatedQuestionSchema, gradingResultSchema, summaryResultSchema } from "./schemas";

export interface OpenAICompatibleConfig {
  // Shown in errors and logs, e.g. "Groq".
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
  // The SDK's own retry on 429/5xx (it waits as long as the retry-after header says). 0 inside a fallback chain.
  maxRetries?: number;
  // Whether the endpoint accepts response_format json_object. Without it the prompt alone asks for JSON, and the
  // reply is read leniently (code fences and text around the object are dropped).
  jsonMode?: boolean;
  // An output limit for JSON calls, for endpoints whose default is too small for a reasoning model's thinking plus
  // its answer (Cloudflare Workers AI cuts replies short otherwise). Unset: the endpoint's default, as before.
  maxTokens?: number;
}

// Any provider that speaks the OpenAI chat API: Groq, xAI, Cloudflare Workers AI, Ollama, and so on. Each is just a
// base URL, a key and a model (see provider.factory.ts).
export class OpenAICompatibleProvider implements AIProvider {
  protected client: OpenAI;
  readonly model: string;
  private label: string;
  private jsonMode: boolean;
  private maxTokens?: number;

  constructor(config: OpenAICompatibleConfig) {
    // Ollama needs no key, but the SDK insists on one.
    this.client = new OpenAI({ apiKey: config.apiKey || "none", baseURL: config.baseURL, maxRetries: config.maxRetries ?? 2 });
    this.model = config.model;
    this.label = config.label;
    this.jsonMode = config.jsonMode ?? true;
    this.maxTokens = config.maxTokens;
  }

  async generateJson(prompt: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      ...(this.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      messages: [{ role: "user", content: prompt }],
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error(`${this.label} returned an empty response`);
    return parseJsonReply(text);
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

  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    // gpt-oss is a reasoning model: keep its thinking short, and leave room for it on top of the answer.
    if (!this.model.includes("gpt-oss")) return openaiChat(this.client, this.model, messages, options);
    return openaiChat(this.client, this.model, messages, { ...options, maxTokens: (options.maxTokens ?? 800) + 1000 }, { reasoning_effort: "low" });
  }
}

// A JSON reply, read leniently: models without a JSON mode sometimes wrap it in ``` fences or add a sentence.
export function parseJsonReply(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new SyntaxError(`Reply wasn't JSON: ${text.slice(0, 120)}`);
  }
}
