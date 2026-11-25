import { useState } from "react";
import { api, ApiError } from "../api/client";

export interface PoolInfo {
  itemId: string;
  credit?: string | null;
  sourceUrl?: string | null;
  licence?: string | null;
}

const voteKey = (itemId: string) => `pool-vote:${itemId}`;

function readVote(itemId: string): boolean | null {
  try {
    const v = localStorage.getItem(voteKey(itemId));
    return v === "yes" ? true : v === "no" ? false : null;
  } catch {
    return null;
  }
}

// Under a question that came from the shared pool: where it came from (GitHub questions are credited), and a
// "Was this realistic?" vote that the admin update uses to retire weak questions. Renders nothing otherwise.
export function PoolNote({ pool }: { pool: PoolInfo | null | undefined }) {
  const [vote, setVote] = useState<boolean | null>(() => (pool ? readVote(pool.itemId) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pool) return null;

  async function send(realistic: boolean) {
    if (!pool) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/pool/items/${encodeURIComponent(pool.itemId)}/vote`, { realistic });
      setVote(realistic);
      try {
        localStorage.setItem(voteKey(pool.itemId), realistic ? "yes" : "no");
      } catch {
        // Only remembers the vote on this device; the server has it either way.
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your vote. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pool-note">
      {pool.credit && (
        <p className="helper-text">
          {pool.credit}{" "}
          {pool.sourceUrl && (
            <a href={pool.sourceUrl} target="_blank" rel="noreferrer">
              See the source
            </a>
          )}
        </p>
      )}
      <div className="pool-vote" role="group" aria-label="Was this a realistic interview question?">
        <span className="helper-text">Realistic interview question?</span>
        <button type="button" className="btn btn-secondary pool-vote-btn" aria-pressed={vote === true} disabled={saving} onClick={() => send(true)}>
          Realistic
        </button>
        <button type="button" className="btn btn-secondary pool-vote-btn" aria-pressed={vote === false} disabled={saving} onClick={() => send(false)}>
          Not realistic
        </button>
        <span className="visually-hidden" aria-live="polite">
          {vote === null ? "" : "Thanks, your vote is saved."}
        </span>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
