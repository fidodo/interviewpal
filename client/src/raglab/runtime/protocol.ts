// Messages between the RAG Lab page and the worker running the learner's bot (raglab-js.worker.ts for
// JavaScript/TypeScript, raglab-py.worker.ts for Python). Both workers speak this same protocol.
export type LabLanguage = "python" | "typescript" | "javascript";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface RunCase {
  id: string;
  question: string;
  history: Turn[];
}

export interface RunRequest {
  type: "run";
  code: string;
  language: LabLanguage;
  cases: RunCase[];
  k: number;
}

export interface RetrievedChunk {
  docId: string;
  chunkId?: string;
  text?: string;
  score?: number;
}

export interface CaseOutput {
  caseId: string;
  retrieved: RetrievedChunk[];
  answer: string;
  citations: string[];
  ms: number;
  error: string | null;
}

export interface Usage {
  llmCalls: number;
  embedCalls: number;
  embeddedTexts: number;
  inputTokens: number;
  outputTokens: number;
}

export const emptyUsage = (): Usage => ({ llmCalls: 0, embedCalls: 0, embeddedTexts: 0, inputTokens: 0, outputTokens: 0 });

export interface TraceEntry {
  // Milliseconds since the run started.
  t: number;
  kind: "status" | "toolkit" | "log" | "print" | "error";
  text: string;
}

export type WorkerMessage =
  | { type: "trace"; entry: TraceEntry }
  | { type: "case"; index: number; output: CaseOutput }
  // `error` is set when the run couldn't get going at all (code doesn't load, index() fails).
  | { type: "done"; usage: Usage; error: string | null };

// Limits applied to what a bot returns, matching the server's (server/src/raglab/grader.ts).
export const LIMITS = { retrieved: 10, chunkText: 4000, answer: 6000, citations: 20, id: 100, chunkId: 200 };
