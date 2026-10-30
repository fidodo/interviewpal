import { transform } from "sucrase";
import { RunRequest, emptyUsage } from "./protocol";
import { createToolkit, describe, post, runCases, startClock, trace } from "./toolkit";

// Runs a JavaScript or TypeScript RagBot. TypeScript is stripped to JavaScript with sucrase, `export` becomes
// CommonJS, and the code runs with `new Function`, which is why this worker has its own CSP in vercel.json:
// 'unsafe-eval' plus connect-src 'self' for the toolkit, and nothing else. A fresh worker is used for each run.

const scope = self as unknown as { onmessage: ((event: MessageEvent<RunRequest>) => void) | null };

function formatError(err: unknown) {
  if (err instanceof Error) {
    // Line numbers in our compiled code would mislead; the message is what helps.
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

scope.onmessage = async (event) => {
  const { code, language, cases, k } = event.data;
  const usage = emptyUsage();
  startClock();
  try {
    let compiled: string;
    try {
      compiled = transform(code, { transforms: language === "typescript" ? ["typescript", "imports"] : ["imports"] }).code;
    } catch (err) {
      throw new Error(`Your code doesn't compile: ${err instanceof Error ? err.message : String(err)}`);
    }
    const ip = createToolkit(usage);
    const print = (...args: unknown[]) => trace("print", args.map(describe).join(" "));
    const fakeConsole = { log: print, info: print, warn: print, error: print, debug: print };
    const require = (name: string) => {
      throw new Error(`Imports aren't available here ("${name}"). Use the ip toolkit and plain ${language === "typescript" ? "TypeScript" : "JavaScript"}.`);
    };
    const module = { exports: {} as Record<string, unknown> };
    new Function("exports", "require", "module", "ip", "console", compiled)(module.exports, require, module, ip, fakeConsole);
    const RagBot = module.exports.RagBot as (new () => { index(d: unknown): unknown; search(q: string, k: number): unknown; ask(q: string, h: unknown): unknown }) | undefined;
    if (typeof RagBot !== "function") throw new Error("Your code must export a class called RagBot (export class RagBot { ... }).");

    const bot = new RagBot();
    trace("status", "Indexing the corpus…");
    const t0 = performance.now();
    await bot.index(await ip.corpus());
    trace("status", `Indexed in ${Math.round(performance.now() - t0)} ms`);
    await runCases(cases, k, async (q, kk) => bot.search(q, kk), async (q, h) => bot.ask(q, structuredClone(h)), formatError);
    post({ type: "done", usage, error: null });
  } catch (err) {
    trace("error", formatError(err));
    post({ type: "done", usage, error: formatError(err) });
  }
};
