import { ApiError } from "../api/client";
import { Difficulty } from "../types";

// Shared by the debug practice pages.

export const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
export const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// Writing an exercise is several AI steps, and falls back to slower models when the fast one is busy.
export const WRITING_DETAIL =
  "Writing a bug report, code with planted bugs, tests and a reference fix, then checking them. This usually takes 5-20 seconds, and up to a minute when the AI is busy.";
// After this long, the busy note adds that it can take up to a minute.
export const SLOW_AFTER_SECONDS = 20;

// Shown while an exercise is being written: what's happening and how long it's taken. Screen readers get the label
// from the page's status region instead, so the ticking seconds aren't read out.
export function ProgressCard({ label, seconds, detail }: { label: string; seconds: number; detail: string }) {
  return (
    <div className="progress-card">
      <p className="progress-card-title">
        {label} <span className="helper-text">{seconds}s</span>
      </p>
      <div className="progress-bar" aria-hidden="true">
        <span />
      </div>
      <p className="helper-text">{detail}</p>
    </div>
  );
}

// Resolves to null if the promise takes longer than ms, so a slow Python download never holds up grading.
export function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer = 0;
  return Promise.race([promise, new Promise<null>((resolve) => (timer = window.setTimeout(() => resolve(null), ms)))]).finally(() => window.clearTimeout(timer));
}

// Why the buttons are disabled right now, and for how long. After 20 seconds it says this can take up to a minute.
export function BusyNote({ label, seconds }: { label: string; seconds: number }) {
  return (
    <p className="helper-text debug-busy">
      <span className="debug-busy-dot" aria-hidden="true" />
      {label} {seconds}s
      {seconds >= SLOW_AFTER_SECONDS && ". Still working; when the AI is busy this can take up to a minute."}
    </p>
  );
}
