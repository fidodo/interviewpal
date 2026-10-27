import { PRELUDE } from "./prelude";
import type { RunRequest, WorkerMessage } from "./protocol";

// Pyodide is loaded from the CDN (not bundled) so it only downloads when a learner opens the Python runner.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const MAX_OUTPUT = 20000;

interface PyProxy {
  set(key: string, value: unknown): void;
  destroy(): void;
}
interface Pyodide {
  runPython(code: string, options?: { globals?: PyProxy; filename?: string }): unknown;
  setStdout(options: { write: (buffer: Uint8Array) => number }): void;
  setStderr(options: { write: (buffer: Uint8Array) => number }): void;
  globals: { get(name: string): (...args: unknown[]) => PyProxy };
}

// The client tsconfig uses the DOM lib, where `self` is a Window; describe the worker scope we actually use.
const scope = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
};

let pyodide: Pyodide | null = null;
let output = "";

function post(message: WorkerMessage) {
  scope.postMessage(message);
}

function append(text: string) {
  if (output.length >= MAX_OUTPUT) return;
  output += text;
  if (output.length >= MAX_OUTPUT) output = output.slice(0, MAX_OUTPUT) + "\n…(output cut off: too much printing)\n";
}

const HINTS: Record<string, string> = {
  NameError: "Python doesn't know that name yet. Check the spelling, or make the variable before you use it.",
  SyntaxError: "Python can't read something here. Look for a missing bracket, quote mark, or colon (:).",
  IndentationError: "The spaces at the start of a line are off. Lines inside a loop, if or def need 4 spaces.",
  TypeError: "Two things that don't mix were used together, like adding a number to words. Try str() or int().",
  ZeroDivisionError: "You can't divide by zero!",
  IndexError: "That list position doesn't exist. Remember, lists start counting at 0.",
  KeyError: "That key isn't in the dictionary yet.",
  AttributeError: "That thing doesn't have that ability. Check the word after the dot.",
  ValueError: "The value isn't the kind Python expected here.",
  RecursionError: "A function kept calling itself forever. Make sure it has a way to stop.",
  RuntimeError: "",
};

// Turn a Python traceback into one line a kid can act on: which line, what went wrong, and a hint.
function friendlyError(raw: string): string {
  const lines = raw.trim().split("\n");
  const last = lines[lines.length - 1] ?? raw;
  const lineMatches = [...raw.matchAll(/File "my_code\.py", line (\d+)/g)];
  const lineNo = lineMatches.length ? lineMatches[lineMatches.length - 1][1] : null;
  const type = last.split(":")[0].trim();
  const hint = HINTS[type];
  return [lineNo ? `Line ${lineNo}: ${last}` : last, hint].filter(Boolean).join("\n");
}

async function init() {
  try {
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`);
    pyodide = (await loadPyodide({ indexURL: PYODIDE_URL })) as Pyodide;
    // Raw writes (not line-batched) so print(..., end="") output isn't held back waiting for a newline.
    const decoder = new TextDecoder();
    pyodide.setStdout({
      write: (buffer) => {
        append(decoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
    });
    // Warnings go to stderr; keep them out of the output that's compared with the expected answer.
    pyodide.setStderr({ write: (buffer) => buffer.length });
    pyodide.runPython(PRELUDE);
    post({ type: "ready" });
  } catch (err) {
    post({ type: "load-error", message: err instanceof Error ? err.message : String(err) });
  }
}

scope.onmessage = (event) => {
  const { id, code, stdin } = event.data;
  if (!pyodide) return;
  output = "";
  let error: string | null = null;
  const namespace = pyodide.globals.get("dict")();
  // So `if __name__ == "__main__":` blocks run, as they would for a script.
  namespace.set("__name__", "__main__");
  try {
    pyodide.runPython("_kids_reset()");
    pyodide.globals.get("_kids_set_inputs")(stdin);
    pyodide.runPython(code, { globals: namespace, filename: "my_code.py" });
  } catch (err) {
    error = friendlyError(err instanceof Error ? err.message : String(err));
  } finally {
    pyodide.runPython("import sys; sys.stdout.flush()");
    namespace.destroy();
  }
  const drawing = JSON.parse(pyodide.runPython("_kids_turtle_json()") as string);
  post({ type: "result", id, stdout: output, error, drawing });
};

init();
