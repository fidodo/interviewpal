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

export class FallbackProvider implements AIProvider {
  constructor(private providers: { name: string; provider: AIProvider }[]) {
    if (providers.length === 0) throw new Error("FallbackProvider needs at least one provider");
  }

  private async run<T>(call: (p: AIProvider) => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      const { name, provider } = this.providers[i];
      try {
        const result = await call(provider);
        if (i > 0) console.warn(`AI: answered by fallback provider "${name}"`);
        return result;
      } catch (err) {
        const next = this.providers[i + 1];
        if (!next || !canFailOver(err)) throw err;
        const status = (err as { status?: number }).status;
        console.warn(`AI: provider "${name}" failed (${status ?? (err as Error).name}), trying "${next.name}"`);
      }
    }
  }

  generateQuestion = (params: Parameters<AIProvider["generateQuestion"]>[0]) => this.run((p) => p.generateQuestion(params));
  gradeAnswer = (params: Parameters<AIProvider["gradeAnswer"]>[0]) => this.run((p) => p.gradeAnswer(params));
  generateSummary = (params: Parameters<AIProvider["generateSummary"]>[0]) => this.run((p) => p.generateSummary(params));
  generateJson = (prompt: string) => this.run((p) => p.generateJson(prompt));
  chat = (messages: ChatMessage[], options: ChatOptions) => this.run((p) => p.chat(messages, options));
}
