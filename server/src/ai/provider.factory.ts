import { AIProviderName, env, ProviderEntry } from "../config/env";
import { AIProvider } from "./provider.interface";
import { FallbackProvider } from "./fallback.provider";
import { GeminiProvider } from "./gemini.provider";
import { GrokProvider } from "./grok.provider";
import { GroqProvider } from "./groq.provider";
import { MistralProvider } from "./mistral.provider";
import { OpenAICompatibleProvider } from "./openaiCompatible.provider";

// Whether a provider can be used here: it has its key, and (Ollama) it's somewhere the server can reach.
const available: Record<AIProviderName, () => boolean> = {
  gemini: () => Boolean(env.gemini.apiKey),
  grok: () => Boolean(env.xai.apiKey),
  groq: () => Boolean(env.groq.apiKey),
  mistral: () => Boolean(env.mistral.apiKey),
  cloudflare: () => Boolean(env.cloudflare.accountId && env.cloudflare.apiToken),
  // A model on your own computer: only for local development, never from a deployed server.
  ollama: () => !env.isProd,
};

const defaultModel: Record<AIProviderName, () => string> = {
  gemini: () => env.gemini.model,
  grok: () => env.xai.model,
  groq: () => env.groq.model,
  mistral: () => env.mistral.model,
  cloudflare: () => env.cloudflare.model,
  ollama: () => env.ollama.model,
};

// `inChain`: with a fallback behind it, a provider shouldn't sit out long rate-limit waits; fail over instead.
function createOne({ name, model = defaultModel[name]() }: ProviderEntry, inChain: boolean): AIProvider {
  const maxRetries = inChain ? 0 : 2;
  switch (name) {
    case "grok":
      return new GrokProvider(model, maxRetries);
    case "groq":
      return new GroqProvider(model, maxRetries);
    case "mistral":
      return new MistralProvider(model, maxRetries);
    case "gemini":
      return new GeminiProvider(model);
    case "cloudflare":
      return new OpenAICompatibleProvider({
        label: "Cloudflare Workers AI",
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare.accountId}/ai/v1`,
        apiKey: env.cloudflare.apiToken,
        model,
        maxRetries,
      });
    case "ollama":
      return new OpenAICompatibleProvider({ label: "Ollama", baseURL: env.ollama.baseURL, apiKey: "", model, maxRetries });
    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}

// How an entry shows in logs: "groq(llama-3.3-70b-versatile)" when it names its own model.
export function entryLabel(entry: ProviderEntry) {
  return entry.model ? `${entry.name}(${entry.model})` : entry.name;
}

// AI_PROVIDERS ("groq,gemini,groq:llama-3.3-70b-versatile,cloudflare") builds a fallback chain from the entries that
// can be used here; otherwise the single AI_PROVIDER is used as before.
function createProvider(): AIProvider {
  const chain = env.aiProviders.filter((entry) => {
    if (!(entry.name in available)) throw new Error(`Unknown AI provider in AI_PROVIDERS: ${entry.name}`);
    return available[entry.name]();
  });
  if (chain.length > 1) {
    console.log(`AI providers (in fallback order): ${chain.map(entryLabel).join(" → ")}`);
    return new FallbackProvider(chain.map((entry, i) => ({ name: entryLabel(entry), provider: createOne(entry, i < chain.length - 1) })));
  }
  return createOne(chain[0] ?? { name: env.aiProvider }, false);
}

export const aiProvider: AIProvider = createProvider();
