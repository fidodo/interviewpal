import { Link } from "react-router-dom";
import { SessionListItem } from "../types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function HistoryList({ sessions }: { sessions: SessionListItem[] }) {
  if (sessions.length === 0) {
    return <p className="empty-state">No sessions yet — start your first mock interview above.</p>;
  }

  return (
    <div>
      {sessions.map((s) => (
        <Link key={s.id} to={`/sessions/${s.id}${s.status === "COMPLETED" ? "/summary" : ""}`} className="history-row">
          <div className="history-meta">
            <strong>{s.topic.name}</strong>
            <div className="history-tags">
              <span className="badge badge-primary">{s.track}</span>
              <span className="badge">{s.difficulty}</span>
              <span className="badge">{formatDate(s.startedAt)}</span>
              {s.status === "ACTIVE" && <span className="badge">In progress</span>}
            </div>
          </div>
          {s.summary && (
            <div className={`score-badge ${s.summary.overallScore >= 7 ? "score-high" : s.summary.overallScore >= 4 ? "score-mid" : "score-low"}`}>
              {s.summary.overallScore}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
