import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ROUND_LABELS, SessionDetail, Summary, Verdict } from "../types";
import { ScoreBadge } from "../components/ScoreBadge";
import { FeedbackCard } from "../components/FeedbackCard";

const VERDICTS: Record<Verdict, { label: string; note: string }> = {
  HIRE: { label: "Hire", note: "You'd likely get an offer at this level." },
  LEAN_HIRE: { label: "Lean hire", note: "Probably yes, with a few concerns to tidy up." },
  NO_HIRE: { label: "Not yet", note: "Not ready at this level yet. The points below show what to work on." },
};

interface SkillTested {
  name: string;
  rating: number | null;
}

export function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skillsTested, setSkillsTested] = useState<SkillTested[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<{ session: SessionDetail }>(`/sessions/${id}`),
      api.get<{ summary: Summary; skillsTested: SkillTested[] }>(`/sessions/${id}/summary`),
    ])
      .then(([sessionRes, summaryRes]) => {
        setSession(sessionRes.session);
        setSummary(summaryRes.summary);
        setSkillsTested(summaryRes.skillsTested ?? []);
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

      {summary.verdict && (
        <section className={`card verdict verdict-${summary.verdict.toLowerCase().replace("_", "-")}`} aria-labelledby="verdict-title">
          <p className="verdict-eyebrow">Mock interview verdict</p>
          <h2 id="verdict-title" className="verdict-title">
            {VERDICTS[summary.verdict].label}
          </h2>
          <p className="verdict-note">{VERDICTS[summary.verdict].note}</p>
          {summary.roundScores && summary.roundScores.length > 0 && (
            <dl className="round-scores">
              {summary.roundScores.map((r) => (
                <div key={r.round} className="round-score">
                  <dt>{ROUND_LABELS[r.round] ?? r.round}</dt>
                  <dd>
                    <span className="skill-bar" role="img" aria-label={`${r.score} out of 10`}>
                      <span style={{ width: `${r.score * 10}%` }} />
                    </span>
                    <span aria-hidden="true">{r.score}/10</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

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

      {skillsTested.length > 0 && (
        <section className="card" aria-labelledby="skills-tested-title">
          <h2 id="skills-tested-title" className="card-title">
            Skills this updated
          </h2>
          <ul className="skills-tested">
            {skillsTested.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="helper-text">{s.rating == null ? "unrated" : `now ${s.rating.toFixed(1)}/5`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {session.questions.some((q) => q.answer?.feedback) && (
        <section aria-labelledby="review-title" className="question-review">
          <h2 id="review-title" className="card-title">
            Question by question
          </h2>
          {session.questions
            .filter((q) => q.answer?.feedback)
            .map((q) => (
              <details key={q.id} className="card review-item">
                <summary>
                  <span className="review-head">
                    <span className="review-label">
                      Question {q.order}
                      {q.round && ` · ${ROUND_LABELS[q.round]}`} · {q.answer!.feedback!.score}/10
                    </span>
                    <span className="review-question">{q.text}</span>
                  </span>
                </summary>
                <h3 className="feedback-list-title">Your answer</h3>
                <p className="review-answer">{q.answer!.transcript}</p>
                <FeedbackCard feedback={q.answer!.feedback!} fillerStats={q.answer!.fillerStats} />
              </details>
            ))}
        </section>
      )}

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
