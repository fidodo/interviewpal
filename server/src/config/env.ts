import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: required("JWT_SECRET"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  aiProvider: (process.env.AI_PROVIDER ?? "gemini") as "gemini" | "grok" | "groq",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  },
  xai: {
    apiKey: process.env.XAI_API_KEY ?? "",
    model: process.env.XAI_MODEL ?? "grok-beta",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  },
  isProd: process.env.NODE_ENV === "production",
};
