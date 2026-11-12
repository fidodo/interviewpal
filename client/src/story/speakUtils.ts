import { ApiError } from "../api/client";

// Shared by the Speak pages.
export const PLAN_SECONDS = 60;
// Below this, the recording is treated as missing and the take as typed (no pace is measured).
export const MIN_TIMED_SECONDS = 5;
export const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
export const minutes = (s: number) => `${s / 60} min`;
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// A score's change since the previous take, in words.
export function delta(now: number, before: number | undefined) {
  if (before === undefined) return null;
  const d = now - before;
  return d === 0 ? "no change" : d > 0 ? `up ${d}` : `down ${-d}`;
}
