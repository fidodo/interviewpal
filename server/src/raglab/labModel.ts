import { env } from "../config/env";
import { GeminiProvider } from "../ai/gemini.provider";
import { GroqProvider } from "../ai/groq.provider";
import { MistralProvider } from "../ai/mistral.provider";
import { AIProvider } from "../ai/provider.interface";

// A learner's bot makes a burst of model calls (one or more per test question), so ip.llm gets its own model rather
// than sharing the interview model's free-tier allowance. RAG_LAB_PROVIDER picks it:
// - "groq" (default, free): gpt-oss-20b, which has its own allowance on Groq (1,000 calls a day and 8,000 tokens a
//   minute for the whole app). Runs are slow because of the per-minute cap; the SDK waits out 429s.
// - "mistral" (free mode): mistral-large-4, the one strong Mistral model free mode allows (50 calls and 20,000
//   tokens a minute; Small and Medium get 0). It reasons before answering, so each call takes about 20 seconds.
// - "gemini": Flash-Lite. Fast, but the free tier is only 20 calls a day, so it needs billing turned on.
// RAG_LAB_MODEL overrides the model. Callers also wrap calls in retryOnRateLimit (ai/retry.ts).
function createLabProvider(): AIProvider {
  switch (env.ragLab.provider) {
    case "gemini":
      return new GeminiProvider(env.ragLab.model ?? "gemini-2.5-flash-lite");
    case "mistral":
      return new MistralProvider(env.ragLab.model ?? "mistral-large-4", 6);
    default:
      return new GroqProvider(env.ragLab.model ?? "openai/gpt-oss-20b", 6);
  }
}

export const labProvider: AIProvider = createLabProvider();
