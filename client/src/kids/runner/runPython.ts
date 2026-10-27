import { EMPTY_DRAWING, TurtleDrawing, WorkerMessage } from "./protocol";

export interface RunResult {
  stdout: string;
  error: string | null;
  drawing: TurtleDrawing;
}

const RUN_TIMEOUT_MS = 5000;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;

function boot(): Promise<void> {
  if (ready) return ready;
  const w = new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" });
  worker = w;
  ready = new Promise<void>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "ready") {
        w.removeEventListener("message", onMessage);
        resolve();
      } else if (event.data.type === "load-error") {
        w.removeEventListener("message", onMessage);
        reset();
        reject(new Error("Couldn't load Python. Check your internet connection and try again."));
      }
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", () => {
      reset();
      reject(new Error("Couldn't load Python. Check your internet connection and try again."));
    });
  });
  return ready;
}

function reset() {
  worker?.terminate();
  worker = null;
  ready = null;
}

// Start downloading Python early (e.g. when a challenge page opens) so the first Run is quick.
export function preparePython(): Promise<void> {
  return boot();
}

export async function runPython(code: string): Promise<RunResult> {
  await boot();
  const w = worker!;
  const id = nextId++;
  return new Promise<RunResult>((resolve) => {
    // A loop that never ends would freeze the worker forever, so kill it and start a fresh one next time.
    const timer = window.setTimeout(() => {
      w.removeEventListener("message", onMessage);
      reset();
      resolve({
        stdout: "",
        error: "Your program ran for too long and was stopped. Is there a loop that never ends?",
        drawing: EMPTY_DRAWING,
      });
    }, RUN_TIMEOUT_MS);

    function onMessage(event: MessageEvent<WorkerMessage>) {
      const msg = event.data;
      if (msg.type !== "result" || msg.id !== id) return;
      window.clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      resolve({ stdout: msg.stdout, error: msg.error, drawing: msg.drawing });
    }

    w.addEventListener("message", onMessage);
    w.postMessage({ id, code });
  });
}

// A short text description of a drawing, for screen readers and for Pal to judge DRAW challenges.
export function describeDrawing(drawing: TurtleDrawing, maxSegments = 40): string {
  const { lines, dots, bg } = drawing;
  if (lines.length === 0 && dots.length === 0) return "Nothing was drawn.";
  const colours = [...new Set([...lines.map((l) => l[4]), ...dots.map((d) => d[3])])];
  const xs = lines.flatMap((l) => [l[0], l[2]]).concat(dots.map((d) => d[0]));
  const ys = lines.flatMap((l) => [l[1], l[3]]).concat(dots.map((d) => d[1]));
  const round = (n: number) => Math.round(n);
  const parts = [
    `Drew ${lines.length} line${lines.length === 1 ? "" : "s"}${dots.length ? ` and ${dots.length} dot${dots.length === 1 ? "" : "s"}` : ""} in ${colours.join(", ")}.`,
    `It spans x from ${round(Math.min(...xs))} to ${round(Math.max(...xs))} and y from ${round(Math.min(...ys))} to ${round(Math.max(...ys))}.`,
  ];
  if (bg) parts.push(`Background colour: ${bg}.`);
  if (lines.length) {
    const first = lines[0];
    const last = lines[lines.length - 1];
    const closed = Math.hypot(first[0] - last[2], first[1] - last[3]) < 1;
    if (closed) parts.push("The path ends where it started (a closed shape).");
  }
  if (lines.length && maxSegments > 0) {
    const shown = lines.slice(0, maxSegments).map((l) => `(${round(l[0])},${round(l[1])})→(${round(l[2])},${round(l[3])}) ${l[4]}`);
    parts.push(`Lines: ${shown.join("; ")}${lines.length > maxSegments ? `; …and ${lines.length - maxSegments} more` : ""}.`);
  }
  return parts.join(" ");
}
