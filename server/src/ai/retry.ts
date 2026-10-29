import { ZodError, ZodType } from "zod";
import { aiProvider } from "./provider.factory";

// Models now and then return JSON that is malformed, misses a field or breaks a bound. A fresh attempt usually
// fixes it, so retry once on those errors (never on network/provider errors, which have their own handling).
export async function retryOnInvalid<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const invalidOutput = err instanceof ZodError || err instanceof SyntaxError;
      if (!invalidOutput || attempt >= attempts) throw err;
      console.warn(`AI returned invalid JSON (attempt ${attempt}), retrying:`, err instanceof Error ? err.message.slice(0, 200) : err);
    }
  }
}

// A raw JSON completion validated against a zod schema, with the retry above.
export function generateValidated<T>(prompt: string, schema: ZodType<T>): Promise<T> {
  return retryOnInvalid(async () => schema.parse(await aiProvider.generateJson(prompt)));
}
