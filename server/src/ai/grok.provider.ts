import { env } from "../config/env";
import { OpenAICompatibleProvider } from "./openaiCompatible.provider";

// xAI's Grok (unrelated to Groq the company), through its OpenAI-compatible API.
export class GrokProvider extends OpenAICompatibleProvider {
  constructor(model = env.xai.model, maxRetries = 2) {
    super({ label: "Grok", baseURL: "https://api.x.ai/v1", apiKey: env.xai.apiKey, model, maxRetries });
  }
}
