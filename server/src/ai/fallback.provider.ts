import { AIProvider, ChatMessage, ChatOptions } from "./provider.interface";

// Tries providers in order and moves to the next one only when a provider can't answer at all: rate limited, down,
// timed out, or its key is refused. Bad output (malformed JSON, a schema failure, Groq's json_validate_failed) is
// thrown straight out, so retryOnInvalid (ai/retry.ts) retries on the same provider instead of hopping.
export function canFailOver(err: unknown): boolean {
  // Something thrown that isn't an error object (null, a string) says nothing about the provider: don't hop.
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: number }).status;
  if (typeof status === "number") return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
  const name = (err as { name?: string }).name ?? "";
  const code = (err as { code?: string }).code ?? "";
  // OpenAI SDK connection errors and timeouts have no status; neither do fetch failures from the Gemini SDK.
  return /Connection|Timeout|Abort/i.test(name) || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(code) || (err instanceof TypeError && /fetch/i.test(err.message));
}

// A 429 that says to come back in a minute or more means the allowance is used up (often for the day), not a brief
// burst: the chain skips that provider until then, at most an hour, instead of asking it again on every call.
const MIN_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 60 * 60_000;

export function cooldownMs(err: unknown): number {
  if (!err || typeof err !== "object" || (err as { status?: number }).status !== 429) return 0;
  const headers = (err as { headers?: unknown }).headers;
  const raw =
    headers && typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : ((headers as Record<string, string> | undefined)?.["retry-after"] ?? null);
  const seconds = Number(raw);
  if (!raw || !Number.isFinite(seconds)) return 0;
  const ms = seconds * 1000;
  return ms >= MIN_COOLDOWN_MS ? Math.min(ms, MAX_COOLDOWN_MS) : 0;
}

export class FallbackProvider implements AIProvider {
  // Per instance (serverless instances don't share memory): when each out-of-quota provider can be tried again.
  private resting = new Map<number, number>();

  constructor(
    private providers: { name: string; provider: AIProvider }[],
    private now: () => number = Date.now
  ) {
    if (providers.length === 0) throw new Error("FallbackProvider needs at least one provider");
  }

  private async run<T>(call: (p: AIProvider) => Promise<T>): Promise<T> {
    const last = this.providers.length - 1;
    for (let i = 0; ; i++) {
      const { name, provider } = this.providers[i];
      // The last provider is always tried, so a call never fails without trying something.
      if (i < last && (this.resting.get(i) ?? 0) > this.now()) continue;
      try {
        const result = await call(provider);
        if (i > 0) console.warn(`AI: answered by fallback provider "${name}"`);
        return result;
      } catch (err) {
        const rest = cooldownMs(err);
        if (rest) this.resting.set(i, this.now() + rest);
        const next = this.providers[i + 1];
        if (!next || !canFailOver(err)) throw err;
        const status = (err as { status?: number }).status;
        console.warn(
          `AI: provider "${name}" failed (${status ?? (err as Error).name})${rest ? `, out of quota; skipping it for ${Math.round(rest / 60_000)} min` : ""}, trying "${next.name}"`
        );
      }
    }
  }

  generateQuestion = (params: Parameters<AIProvider["generateQuestion"]>[0]) => this.run((p) => p.generateQuestion(params));
  gradeAnswer = (params: Parameters<AIProvider["gradeAnswer"]>[0]) => this.run((p) => p.gradeAnswer(params));
  generateSummary = (params: Parameters<AIProvider["generateSummary"]>[0]) => this.run((p) => p.generateSummary(params));
  generateJson = (prompt: string) => this.run((p) => p.generateJson(prompt));
  chat = (messages: ChatMessage[], options: ChatOptions) => this.run((p) => p.chat(messages, options));
}
