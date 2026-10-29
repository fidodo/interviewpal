import type { JsRunRequest, JsRunResponse, TestCaseResult } from "./protocol";

// Runs the learner's own JavaScript against test cases. This worker is the only script allowed 'unsafe-eval' (its
// own CSP in client/vercel.json), and that CSP also blocks all network access, so the code can't fetch anything.

const scope = self as unknown as {
  postMessage(message: JsRunResponse): void;
  onmessage: ((event: MessageEvent<JsRunRequest>) => void) | null;
};

const MAX_LOG_LINES = 200;

function format(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Compares like JSON: same values, any key order. undefined and missing keys count as equal.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a == null && b == null;
}

function toJson(value: unknown): unknown {
  try {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

scope.onmessage = async (event) => {
  const { id, code, functionName, tests } = event.data;
  const logs: string[] = [];
  const log = (...args: unknown[]) => {
    if (logs.length < MAX_LOG_LINES) logs.push(args.map(format).join(" "));
  };
  const fakeConsole = { log, info: log, warn: log, error: log, debug: log };

  let fn: unknown;
  try {
    // functionName is checked on the server to be a plain identifier.
    fn = new Function("console", `"use strict";\n${code}\n;return typeof ${functionName} === "function" ? ${functionName} : undefined;`)(fakeConsole);
  } catch (err) {
    scope.postMessage({ id, results: [], logs, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    return;
  }
  if (typeof fn !== "function") {
    scope.postMessage({ id, results: [], logs, error: `Couldn't find a function called ${functionName}. Keep its name and parameters as given.` });
    return;
  }

  const results: TestCaseResult[] = [];
  for (const test of tests) {
    try {
      // Fresh copies so a test that mutates its input can't affect the next one.
      const args = JSON.parse(JSON.stringify(test.args)) as unknown[];
      const got = toJson(await (fn as (...a: unknown[]) => unknown)(...args));
      results.push({ passed: deepEqual(got, test.expected), got });
    } catch (err) {
      results.push({ passed: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
  scope.postMessage({ id, results, logs, error: null });
};
