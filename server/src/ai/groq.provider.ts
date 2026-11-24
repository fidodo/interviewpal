import { env } from "../config/env";
import { OpenAICompatibleProvider } from "./openaiCompatible.provider";

// Groq (groq.com), through its OpenAI-compatible API. Each Groq model has its own free allowance, so one key can sit
// in the fallback chain twice with different models (AI_PROVIDERS="groq,...,groq:llama-3.3-70b-versatile").
export class GroqProvider extends OpenAICompatibleProvider {
  // `maxRetries` is the SDK's own retry on 429/5xx, which waits as long as Groq's retry-after header says.
  constructor(model = env.groq.model, maxRetries = 2) {
    super({ label: "Groq", baseURL: "https://api.groq.com/openai/v1", apiKey: env.groq.apiKey, model, maxRetries });
  }
}
