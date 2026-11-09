import { AIProviderName, env } from "../config/env";
import { AIProvider } from "./provider.interface";
import { FallbackProvider } from "./fallback.provider";
import { GeminiProvider } from "./gemini.provider";
import { GrokProvider } from "./grok.provider";
import { GroqProvider } from "./groq.provider";
import { MistralProvider } from "./mistral.provider";

const hasKey: Record<AIProviderName, () => boolean> = {
  gemini: () => Boolean(env.gemini.apiKey),
  grok: () => Boolean(env.xai.apiKey),
  groq: () => Boolean(env.groq.apiKey),
  mistral: () => Boolean(env.mistral.apiKey),
};

// `inChain`: with a fallback behind it, a provider shouldn't sit out long rate-limit waits; fail over instead.
function createOne(name: AIProviderName, inChain: boolean): AIProvider {
  switch (name) {
    case "grok":
      return new GrokProvider();
    case "groq":
      return new GroqProvider(env.groq.model, inChain ? 0 : 2);
    case "mistral":
      return new MistralProvider(env.mistral.model, inChain ? 0 : 2);
    case "gemini":
      return new GeminiProvider();
    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}

// AI_PROVIDERS ("groq,mistral,gemini") builds a fallback chain from the providers that have a key; otherwise the
// single AI_PROVIDER is used as before.
function createProvider(): AIProvider {
  const chain = env.aiProviders.filter((name) => {
    if (!(name in hasKey)) throw new Error(`Unknown AI provider in AI_PROVIDERS: ${name}`);
    return hasKey[name]();
  });
  if (chain.length > 1) {
    console.log(`AI providers (in fallback order): ${chain.join(" → ")}`);
    return new FallbackProvider(chain.map((name, i) => ({ name, provider: createOne(name, i < chain.length - 1) })));
  }
  return createOne(chain[0] ?? env.aiProvider, false);
}

export const aiProvider: AIProvider = createProvider();
