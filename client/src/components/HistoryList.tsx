import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionListItem } from "../types";
import { ScoreBadge } from "./ScoreBadge";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface HistoryListProps {
  sessions: SessionListItem[];
  onDelete?: (id: string) => void;
}

export function HistoryList({ sessions, onDelete }: HistoryListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="empty-state">No sessions yet — start your first mock interview above.</p>;
  }

  async function handleDelete(s: SessionListItem) {
    if (!window.confirm(`Delete "${s.topic.name}" and its results? This can't be undone.`)) return;
    setDeletingId(s.id);
    setError(null);
    try {
      await api.del(`/sessions/${s.id}`);
      onDelete?.(s.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this session. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {sessions.map((s) => (
        <div key={s.id} className="history-row">
          <Link to={`/sessions/${s.id}${s.status === "COMPLETED" ? "/summary" : ""}`} className="history-row-link">
            <div className="history-meta">
              <strong>{s.topic.name}</strong>
              <div className="history-tags">
                <span className="badge badge-primary">{s.track}</span>
                <span className="badge">{s.difficulty}</span>
                <span className="badge">{formatDate(s.startedAt)}</span>
                {s.status === "ACTIVE" && <span className="badge">In progress</span>}
              </div>
            </div>
            {s.summary && <ScoreBadge score={s.summary.overallScore} />}
          </Link>
          {onDelete && (
            <button
              type="button"
              className="history-delete-btn"
              aria-label={`Delete ${s.topic.name} session`}
              disabled={deletingId === s.id}
              onClick={() => handleDelete(s)}
            >
              {deletingId === s.id ? (
                <span aria-hidden="true">…</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
