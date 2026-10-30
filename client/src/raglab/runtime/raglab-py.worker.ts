import { PYODIDE_URL } from "../../code/pyodide";
import { RunRequest, emptyUsage, Usage } from "./protocol";
import { createToolkit, post, runCases, startClock, trace } from "./toolkit";

// Runs a Python RagBot with Pyodide (same CDN build as the kids runner) plus numpy. The `ip` module is a thin Python
// wrapper over a JS bridge; values cross as JSON strings so nothing depends on Pyodide's proxy conversions. The
// worker (and the loaded Python) is reused between runs; each run gets a fresh namespace.

interface PyProxy {
  get(name: string): ((...args: unknown[]) => Promise<string>) & { destroy(): void };
  destroy(): void;
}
interface Pyodide {
  loadPackage(names: string[]): Promise<void>;
  runPythonAsync(code: string, options?: { globals?: PyProxy; filename?: string }): Promise<unknown>;
  registerJsModule(name: string, module: object): void;
  setStdout(options: { batched: (line: string) => void }): void;
  setStderr(options: { batched: (line: string) => void }): void;
  globals: { get(name: string): () => PyProxy };
  FS: { writeFile(path: string, data: string): void };
}

const scope = self as unknown as { onmessage: ((event: MessageEvent<RunRequest>) => void) | null };

const IP_MODULE = `
import json as _json
import _ip_bridge as _b


async def corpus():
    """The built-in documents: [{"id", "title", "text"}]."""
    return _json.loads(await _b.corpus())


async def embed(texts, kind="document"):
    """One vector (a list of 768 floats) per text. kind: "document" for chunks, "query" for questions."""
    if isinstance(texts, str):
        raise TypeError('ip.embed takes a list of texts, e.g. await ip.embed([text], kind="query")')
    return _json.loads(await _b.embed(_json.dumps([str(t) for t in texts]), kind))


async def llm(messages, json_mode=False, temperature=0.2, max_tokens=800):
    """A chat model call. Returns {"text": str, "usage": {"inputTokens", "outputTokens"}}."""
    options = {"json": json_mode, "temperature": temperature, "maxTokens": max_tokens}
    return _json.loads(await _b.llm(_json.dumps(messages), _json.dumps(options)))


def tokens(text):
    """An approximate token count (about 4 characters per token)."""
    return max(1, -(-len(str(text)) // 4))


def log(stage, data=None):
    """Adds a line to the trace shown under the results."""
    _b.log(str(stage), "" if data is None else _json.dumps(data, default=str))
`;

// Runs after the learner's code, in the same namespace: builds the bot and turns its results into JSON.
const HARNESS = `
import json as _ip_json
import ip as _ip


def _ip_plain(v):
    try:
        import numpy as _np
        if isinstance(v, _np.generic):
            return v.item()
    except ImportError:
        pass
    return v


async def _ip_index():
    global _ip_bot
    if "RagBot" not in globals():
        raise NameError("Your code must define a class called RagBot")
    _ip_bot = RagBot()
    await _ip_bot.index(await _ip.corpus())


async def _ip_search(q, k):
    return _ip_json.dumps(await _ip_bot.search(q, k), default=_ip_plain)


async def _ip_ask(q, history):
    return _ip_json.dumps(await _ip_bot.ask(q, _ip_json.loads(history)), default=_ip_plain)
`;

let pyodide: Pyodide | null = null;
let usage: Usage = emptyUsage();
let toolkit = createToolkit(usage);

// Keeps the useful part of a Python traceback: the lines in the learner's file and the error itself.
function formatError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.trim().split("\n");
  const last = lines[lines.length - 1];
  const where = [...raw.matchAll(/File "rag_bot\.py", line (\d+)/g)].map((m) => m[1]);
  return where.length ? `${last} (rag_bot.py line ${where[where.length - 1]})` : last;
}

async function load() {
  if (pyodide) return pyodide;
  trace("status", "Loading Python and numpy (first run only, this can take a few seconds)…");
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`);
  const py = (await loadPyodide({ indexURL: PYODIDE_URL })) as Pyodide;
  await py.loadPackage(["numpy"]);
  py.setStdout({ batched: (line) => trace("print", line) });
  py.setStderr({ batched: (line) => trace("print", line) });
  // The bridge reads `toolkit` at call time, so each run's usage counter is the one charged.
  py.registerJsModule("_ip_bridge", {
    corpus: async () => JSON.stringify(await toolkit.corpus()),
    embed: async (texts: string, kind: string) => JSON.stringify(await toolkit.embed(JSON.parse(texts), kind === "query" ? "query" : "document")),
    llm: async (messages: string, options: string) => JSON.stringify(await toolkit.llm(JSON.parse(messages), JSON.parse(options))),
    log: (stage: string, data: string) => toolkit.log(stage, data ? JSON.parse(data) : undefined),
  });
  py.FS.writeFile("/home/pyodide/ip.py", IP_MODULE);
  pyodide = py;
  return py;
}

scope.onmessage = async (event) => {
  const { code, cases, k } = event.data;
  usage = emptyUsage();
  toolkit = createToolkit(usage);
  startClock();
  let ns: PyProxy | null = null;
  try {
    const py = await load();
    ns = py.globals.get("dict")();
    await py.runPythonAsync(code, { globals: ns, filename: "rag_bot.py" });
    await py.runPythonAsync(HARNESS, { globals: ns });
    const call = async (name: string, ...args: unknown[]) => {
      const fn = ns!.get(name);
      try {
        return await fn(...args);
      } finally {
        fn.destroy();
      }
    };
    trace("status", "Indexing the corpus…");
    const t0 = performance.now();
    await call("_ip_index");
    trace("status", `Indexed in ${Math.round(performance.now() - t0)} ms`);
    await runCases(
      cases,
      k,
      async (q, kk) => JSON.parse(await call("_ip_search", q, kk)),
      async (q, h) => JSON.parse(await call("_ip_ask", q, JSON.stringify(h))),
      formatError
    );
    post({ type: "done", usage, error: null });
  } catch (err) {
    const message = pyodide ? formatError(err) : "Couldn't load Python. Check your internet connection and try again.";
    trace("error", message);
    post({ type: "done", usage, error: message });
  } finally {
    ns?.destroy();
  }
};
