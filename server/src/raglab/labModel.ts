import { env } from "../config/env";
import { GeminiProvider } from "../ai/gemini.provider";
import { GroqProvider } from "../ai/groq.provider";
import { AIProvider } from "../ai/provider.interface";

// A learner's bot makes a burst of model calls (one or more per test question), so ip.llm gets its own model rather
// than sharing the interview model's free-tier allowance. RAG_LAB_PROVIDER picks it:
// - "groq" (default, free): gpt-oss-20b, which has its own allowance on Groq (1,000 calls a day and 8,000 tokens a
//   minute for the whole app). Runs are slow because of the per-minute cap; the SDK waits out 429s.
// - "gemini": Flash-Lite. Fast, but the free tier is only 20 calls a day, so it needs billing turned on.
// RAG_LAB_MODEL overrides the model. Callers also wrap calls in retryOnRateLimit (ai/retry.ts).
export const labProvider: AIProvider =
  env.ragLab.provider === "gemini"
    ? new GeminiProvider(env.ragLab.model ?? "gemini-2.5-flash-lite")
    : new GroqProvider(env.ragLab.model ?? "openai/gpt-oss-20b", 6);
