import { CodeSpec, JsRunResponse, RunLanguage, TestCaseResult, TestRun } from "./protocol";

const JS_TIMEOUT_MS = 5000;
const PY_MARKER = "__IP_TESTS__";
// What the learner's own print() output is cut to, so it can never crowd out the results.
const MAX_PRINTED = 4000;

let jsWorker: Worker | null = null;
let nextId = 1;

function summarise(language: RunLanguage, results: TestCaseResult[], output: string, error: string | null): TestRun {
  return { language, results, passed: results.filter((r) => r.passed).length, total: results.length, output, error };
}

function runJavaScript(code: string, spec: CodeSpec): Promise<TestRun> {
  jsWorker ??= new Worker(new URL("./js-runner.worker.ts", import.meta.url), { type: "module" });
  const worker = jsWorker;
  const id = nextId++;
  return new Promise((resolve) => {
    // An infinite loop would hang the worker for good, so kill it and start fresh next time.
    const timer = window.setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      jsWorker = null;
      resolve(summarise("javascript", [], "", "Your code ran for too long and was stopped. Is there a loop that never ends?"));
    }, JS_TIMEOUT_MS);
    function onMessage(event: MessageEvent<JsRunResponse>) {
      if (event.data.id !== id) return;
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve(summarise("javascript", event.data.results, event.data.logs.join("\n"), event.data.error));
    }
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, code, functionName: spec.functionName, tests: spec.tests });
  });
}

// A harness that runs the learner's code with exec(), capturing (and capping) what it prints, then calls the function
// for each test case. Errors are caught here rather than by the runner, and the results are always printed as the
// last line on their own, so nothing the learner prints can hide or truncate them. Values are compared after a JSON
// round trip, so tuples and lists compare as equal.
function pythonHarness(code: string, spec: CodeSpec) {
  return `
import io as _ip_io, json as _ip_json, contextlib as _ip_ctx, traceback as _ip_tb
_ip_buf = _ip_io.StringIO()
_ip_ns = {"__name__": "__main__"}
_ip_results = []
_ip_error = None

def _ip_fmt(e):
    line = ""
    for f in _ip_tb.extract_tb(e.__traceback__):
        if f.filename == "solution.py":
            line = " (line %d)" % f.lineno
    if isinstance(e, SyntaxError) and e.lineno:
        line = " (line %d)" % e.lineno
    return type(e).__name__ + ": " + str(e) + line

def _ip_value(v):
    try:
        out = _ip_json.loads(_ip_json.dumps(v))
    except Exception:
        out = repr(v)
    return out if len(_ip_json.dumps(out)) <= 500 else repr(v)[:500]

with _ip_ctx.redirect_stdout(_ip_buf):
    try:
        exec(compile(${JSON.stringify(code)}, "solution.py", "exec"), _ip_ns)
        _ip_fn = _ip_ns.get(${JSON.stringify(spec.functionName)})
        if not callable(_ip_fn):
            _ip_error = "Couldn't find a function called ${spec.functionName}. Keep its name and parameters as given."
        else:
            for _ip_t in _ip_json.loads(${JSON.stringify(JSON.stringify(spec.tests))}):
                try:
                    _ip_got = _ip_value(_ip_fn(*_ip_t["args"]))
                    _ip_results.append({"passed": _ip_got == _ip_t["expected"], "got": _ip_got})
                except Exception as _ip_e:
                    _ip_results.append({"passed": False, "error": _ip_fmt(_ip_e)})
    except Exception as _ip_e:
        _ip_error = _ip_fmt(_ip_e)

print(_ip_buf.getvalue()[:${MAX_PRINTED}])
print("\\n${PY_MARKER}" + _ip_json.dumps({"results": _ip_results, "error": _ip_error}))
`;
}

async function runPythonTests(code: string, spec: CodeSpec): Promise<TestRun> {
  // Shares the kids section's Pyodide worker (it has the 5-second timeout); the harness keeps its kid-friendly
  // error hints out of the way by catching errors itself.
  const { runPython } = await import("../kids/runner/runPython");
  const run = await runPython(pythonHarness(code, spec));
  const at = run.stdout.lastIndexOf(PY_MARKER);
  if (at === -1) return summarise("python", [], "", run.error ?? "Your code stopped before the tests could run.");
  const output = run.stdout.slice(0, at).trim();
  try {
    const parsed = JSON.parse(run.stdout.slice(at + PY_MARKER.length).trim()) as { results: TestCaseResult[]; error: string | null };
    return summarise("python", parsed.results, output, parsed.error);
  } catch {
    return summarise("python", [], output, "Couldn't read the test results.");
  }
}

export function runTests(language: RunLanguage, code: string, spec: CodeSpec): Promise<TestRun> {
  return language === "python" ? runPythonTests(code, spec) : runJavaScript(code, spec);
}
