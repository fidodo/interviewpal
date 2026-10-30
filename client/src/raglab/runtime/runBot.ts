import { CaseOutput, LabLanguage, RunCase, TraceEntry, Usage, WorkerMessage, emptyUsage } from "./protocol";

// Runs the learner's bot over a list of cases in a worker. A run that goes on too long, or that the learner stops,
// kills the worker; the cases it didn't reach are marked as stopped so the run can still be graded.
// Long enough for a held-out run on a free-tier model that allows only a few answers a minute.
export const RUN_LIMIT_MS = 10 * 60 * 1000;

export interface RunHandlers {
  onTrace(entry: TraceEntry): void;
  onCase(index: number, output: CaseOutput): void;
}

export interface RunResult {
  outputs: CaseOutput[];
  usage: Usage;
  error: string | null;
}

// The Python worker keeps Pyodide loaded between runs (it takes seconds to start); JavaScript gets a fresh worker.
let pythonWorker: Worker | null = null;

function workerFor(language: LabLanguage) {
  if (language === "python") {
    pythonWorker ??= new Worker(new URL("./raglab-py.worker.ts", import.meta.url), { type: "module" });
    return pythonWorker;
  }
  return new Worker(new URL("./raglab-js.worker.ts", import.meta.url), { type: "module" });
}

export function runBot(language: LabLanguage, code: string, cases: RunCase[], k: number, handlers: RunHandlers) {
  const worker = workerFor(language);
  const outputs: (CaseOutput | undefined)[] = cases.map(() => undefined);
  let finish: (result: RunResult) => void = () => {};
  let done = false;

  const fillMissing = (reason: string) =>
    cases.map((tc, i) => outputs[i] ?? { caseId: tc.id, retrieved: [], answer: "", citations: [], ms: 0, error: reason });

  const cleanUp = (kill: boolean) => {
    window.clearTimeout(timer);
    worker.removeEventListener("message", onMessage);
    worker.removeEventListener("error", onError);
    if (kill || language !== "python") {
      worker.terminate();
      if (language === "python") pythonWorker = null;
    }
  };

  const end = (result: RunResult, kill: boolean) => {
    if (done) return;
    done = true;
    cleanUp(kill);
    finish(result);
  };

  function onMessage(event: MessageEvent<WorkerMessage>) {
    const msg = event.data;
    if (msg.type === "trace") handlers.onTrace(msg.entry);
    else if (msg.type === "case") {
      outputs[msg.index] = msg.output;
      handlers.onCase(msg.index, msg.output);
    } else if (msg.type === "done") {
      end({ outputs: fillMissing(msg.error ?? "Your bot didn't answer this question."), usage: msg.usage, error: msg.error }, false);
    }
  }

  function onError() {
    end({ outputs: fillMissing("The runner crashed."), usage: emptyUsage(), error: "The runner crashed. Try running again." }, true);
  }

  const timer = window.setTimeout(() => {
    const reason = "Stopped: the run took longer than 10 minutes.";
    end({ outputs: fillMissing(reason), usage: emptyUsage(), error: reason }, true);
  }, RUN_LIMIT_MS);

  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onError);
  worker.postMessage({ type: "run", code, language, cases, k });

  return {
    result: new Promise<RunResult>((resolve) => {
      finish = resolve;
    }),
    stop() {
      end({ outputs: fillMissing("Stopped before this question."), usage: emptyUsage(), error: "You stopped the run." }, true);
    },
  };
}
