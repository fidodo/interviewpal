import { ApiError } from "../api/client";

// Shared by the RAG Lab pages.
export const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
export const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
export const MAX_TRACE = 400;
export const SAVE_DELAY_MS = 1200;
