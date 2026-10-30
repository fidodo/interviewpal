import { CaseOutput, LIMITS, RetrievedChunk, RunCase, TraceEntry, Usage, WorkerMessage } from "./protocol";

// The `ip` toolkit and the test loop, shared by both workers. Toolkit calls go to /api/rag-lab with the user's
// cookie (a same-origin fetch from the worker), where they're budgeted and metered.

const scope = self as unknown as { postMessage(message: WorkerMessage): void };
export const post = (message: WorkerMessage) => scope.postMessage(message);

let started = 0;
export function startClock() {
  started = performance.now();
}

export function trace(kind: TraceEntry["kind"], text: string) {
  post({ type: "trace", entry: { t: Math.round(performance.now() - started), kind, text: text.slice(0, 2000) } });
}

export function describe(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) => (Array.isArray(v) && v.length > 12 && typeof v[0] === "number" ? `[${v.length} numbers]` : v));
  } catch {
    return String(value);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/rag-lab/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The toolkit call failed (HTTP ${res.status}).`);
  return data as T;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function createToolkit(usage: Usage) {
  let corpus: unknown[] | null = null;
  return {
    async corpus() {
      corpus ??= (await call<{ docs: unknown[] }>("corpus")).docs;
      // A fresh copy each time, so a bot that edits the documents can't change them for the next run.
      return structuredClone(corpus);
    },
    async embed(texts: string[], kind: "document" | "query" = "document"): Promise<number[][]> {
      if (!Array.isArray(texts)) throw new TypeError("ip.embed takes a list of texts, e.g. ip.embed([text], \"query\")");
      const t0 = performance.now();
      const res = await call<{ vectors: number[][]; cached: number }>("sdk/embed", { texts, kind });
      usage.embedCalls++;
      usage.embeddedTexts += texts.length;
      trace("toolkit", `embed: ${texts.length} ${kind} text${texts.length === 1 ? "" : "s"} (${res.cached} cached) in ${Math.round(performance.now() - t0)} ms`);
      return res.vectors;
    },
    async llm(messages: ChatMessage[], options: { json?: boolean; temperature?: number; maxTokens?: number } = {}) {
      const t0 = performance.now();
      const res = await call<{ text: string; usage: { inputTokens: number; outputTokens: number } }>("sdk/llm", { messages, ...options });
      usage.llmCalls++;
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      trace("toolkit", `llm: ${res.usage.inputTokens} tokens in, ${res.usage.outputTokens} out, ${Math.round(performance.now() - t0)} ms`);
      return res;
    },
    tokens(text: string) {
      return Math.max(1, Math.ceil(String(text).length / 4));
    },
    log(stage: string, data?: unknown) {
      trace("log", data === undefined ? String(stage) : `${stage}: ${describe(data)}`);
    },
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

// What search() returned, in the shape the grader expects (Python's snake_case names are accepted too).
export function normaliseHits(raw: unknown): RetrievedChunk[] {
  if (!Array.isArray(raw)) throw new TypeError("search() must return a list of chunks, e.g. [{ chunkId, docId, text, score }]");
  return raw.slice(0, LIMITS.retrieved).map((hit, i) => {
    const h = (hit ?? {}) as Record<string, unknown>;
    const docId = h.docId ?? h.doc_id;
    if (typeof docId !== "string") throw new TypeError(`search() result ${i + 1} has no docId (Python: doc_id), so it can't be checked`);
    const score = Number(h.score);
    return {
      docId: docId.slice(0, LIMITS.id),
      chunkId: str(h.chunkId ?? h.chunk_id, LIMITS.chunkId) || undefined,
      text: str(h.text, LIMITS.chunkText) || undefined,
      score: Number.isFinite(score) ? score : undefined,
    };
  });
}

export function normaliseAnswer(raw: unknown): { answer: string; citations: string[] } {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || typeof a.answer !== "string") throw new TypeError("ask() must return { answer: string, citations: [docId, ...] }");
  const citations = Array.isArray(a.citations) ? a.citations : [];
  return { answer: a.answer.slice(0, LIMITS.answer), citations: citations.slice(0, LIMITS.citations).map((c) => str(c, LIMITS.id)) };
}

// Runs every case through the bot (search, then ask) and reports each one as it finishes. An error in one case is
// recorded for that case and the run carries on.
export async function runCases(
  cases: RunCase[],
  k: number,
  search: (q: string, k: number) => Promise<unknown>,
  ask: (q: string, history: RunCase["history"]) => Promise<unknown>,
  formatError: (err: unknown) => string
) {
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const t0 = performance.now();
    const output: CaseOutput = { caseId: tc.id, retrieved: [], answer: "", citations: [], ms: 0, error: null };
    trace("status", `Question ${i + 1} of ${cases.length}: ${tc.question}`);
    try {
      output.retrieved = normaliseHits(await search(tc.question, k));
      Object.assign(output, normaliseAnswer(await ask(tc.question, tc.history)));
    } catch (err) {
      output.error = formatError(err).slice(0, 1000);
      trace("error", output.error);
    }
    output.ms = Math.round(performance.now() - t0);
    post({ type: "case", index: i, output });
  }
}
