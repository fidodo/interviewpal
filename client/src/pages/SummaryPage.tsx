import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionDetail, Summary } from "../types";
import { ScoreBadge } from "../components/ScoreBadge";

export function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<{ session: SessionDetail }>(`/sessions/${id}`),
      api.get<{ summary: Summary }>(`/sessions/${id}/summary`),
    ])
      .then(([sessionRes, summaryRes]) => {
        setSession(sessionRes.session);
        setSummary(summaryRes.summary);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this summary."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page">
        <p className="helper-text" role="status">
          Loading summary…
        </p>
      </div>
    );
  }

  if (error || !session || !summary) {
    return (
      <div className="page">
        <p className="error-text" role="alert">
          {error ?? "Summary not available."}
        </p>
        <Link className="btn btn-secondary" to="/">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">{session.topic.name}</h1>
      <div className="history-tags" style={{ marginBottom: 16 }}>
        <span className="badge badge-primary">{session.track}</span>
        <span className="badge">{session.difficulty}</span>
        <span className="badge">
          {session.questions.length} question{session.questions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ScoreBadge score={summary.overallScore} />
          <div>
            <h2 className="feedback-title">Overall score</h2>
            <div className="helper-text">Out of 10 for this session</div>
          </div>
        </div>
        <p style={{ marginTop: 14 }}>{summary.assessment}</p>

        {summary.strengths.length > 0 && (
          <>
            <h3 className="feedback-list-title">Strengths</h3>
            <ul className="feedback-list">
              {summary.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}

        {summary.improvements.length > 0 && (
          <>
            <h3 className="feedback-list-title">Areas to improve</h3>
            <ul className="feedback-list">
              {summary.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="btn-full-row" style={{ marginTop: 16 }}>
        <Link className="btn btn-primary" to="/">
          Start another interview
        </Link>
        <Link className="btn btn-secondary" to="/history">
          View history
        </Link>
      </div>
    </div>
  );
}
