import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export type AIProviderName = "gemini" | "grok" | "groq" | "mistral" | "cloudflare" | "ollama";

// One entry of AI_PROVIDERS: "groq", or "groq:llama-3.3-70b-versatile" to use another model with the same key.
// Split at the first colon only, because Ollama model names have one ("ollama:gpt-oss:20b").
export interface ProviderEntry {
  name: AIProviderName;
  model?: string;
}

export function parseProviderList(value: string): ProviderEntry[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const colon = entry.indexOf(":");
      if (colon < 0) return { name: entry as AIProviderName };
      const model = entry.slice(colon + 1).trim();
      return { name: entry.slice(0, colon).trim() as AIProviderName, ...(model ? { model } : {}) };
    });
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: required("JWT_SECRET"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  aiProvider: (process.env.AI_PROVIDER ?? "gemini") as AIProviderName,
  // Optional fallback order, e.g. "groq,gemini,groq:llama-3.3-70b-versatile,cloudflare": each call moves to the next
  // provider when one is rate limited or down (see ai/fallback.provider.ts). Unset, AI_PROVIDER alone is used.
  aiProviders: parseProviderList(process.env.AI_PROVIDERS ?? ""),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  },
  // The model a RAG Lab bot's ip.llm calls (see raglab/labModel.ts).
  ragLab: {
    provider: (process.env.RAG_LAB_PROVIDER ?? "groq") as "groq" | "gemini" | "mistral",
    model: process.env.RAG_LAB_MODEL,
  },
  xai: {
    apiKey: process.env.XAI_API_KEY ?? "",
    model: process.env.XAI_MODEL ?? "grok-4",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY ?? "",
    model: process.env.MISTRAL_MODEL ?? "mistral-large-4",
  },
  // Cloudflare Workers AI: a free daily allowance (10,000 "neurons", about 60-70 marking calls with gpt-oss-120b).
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    apiToken: process.env.CLOUDFLARE_AI_TOKEN ?? "",
    model: process.env.CLOUDFLARE_MODEL ?? "@cf/openai/gpt-oss-120b",
  },
  // Ollama runs a model on your own computer: free and unlimited, but only for local development, because a deployed
  // server can't reach it (provider.factory.ts skips it in production).
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    model: process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
  },
  // Email (Resend) is optional: without a key, accounts stay unverified and links are only logged in dev.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "InterviewPal <onboarding@resend.dev>",
  // Vercel Cron sends this as a bearer token to /api/cron/* (see server/vercel.json). Without it, cron routes refuse.
  cronSecret: process.env.CRON_SECRET ?? "",
  isProd: process.env.NODE_ENV === "production",
};

export const emailEnabled = Boolean(env.resendApiKey);
