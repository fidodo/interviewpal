import { env } from "../config/env";
import { AIProvider } from "./provider.interface";
import { GeminiProvider } from "./gemini.provider";
import { GrokProvider } from "./grok.provider";
import { GroqProvider } from "./groq.provider";

function createProvider(): AIProvider {
  switch (env.aiProvider) {
    case "grok":
      return new GrokProvider();
    case "groq":
      return new GroqProvider();
    case "gemini":
      return new GeminiProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.aiProvider}`);
  }
}

export const aiProvider: AIProvider = createProvider();
