import { Feedback, FillerStats } from "../types";

function scoreClass(score: number): string {
  if (score >= 7) return "score-high";
  if (score >= 4) return "score-mid";
  return "score-low";
}

const BREAKDOWN_LABELS: Record<string, string> = {
  correctness: "Correctness",
  clarity: "Clarity",
  depth: "Depth",
};

function FillerSummary({ stats }: { stats: FillerStats }) {
  if (stats.count === 0) {
    return <p className="helper-text" style={{ marginTop: 12 }}>No filler words detected — nice and crisp.</p>;
  }
  const rate = stats.wordCount > 0 ? ((stats.count / stats.wordCount) * 100).toFixed(1) : "0";
  const topWords = Object.entries(stats.words)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => `"${word}" ×${count}`)
    .join(", ");
  return (
    <p className="helper-text" style={{ marginTop: 12 }}>
      Filler words: {stats.count} ({rate}% of your answer) — {topWords}
    </p>
  );
}

export function FeedbackCard({ feedback, fillerStats }: { feedback: Feedback; fillerStats?: FillerStats | null }) {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className={`score-badge ${scoreClass(feedback.score)}`}>{feedback.score}</div>
        <div>
          <div style={{ fontWeight: 700 }}>Feedback on your answer</div>
          <div className="helper-text">Score out of 10 for this answer</div>
        </div>
      </div>

      {feedback.breakdown && (
        <div className="breakdown">
          {(Object.entries(feedback.breakdown) as [string, number][]).map(([key, value]) => (
            <div className="breakdown-row" key={key}>
              <span className="breakdown-label">{BREAKDOWN_LABELS[key] ?? key}</span>
              <div className="breakdown-bar">
                <div className={`breakdown-bar-fill ${scoreClass(value)}`} style={{ width: `${value * 10}%` }} />
              </div>
              <span className="breakdown-value">{value}</span>
            </div>
          ))}
        </div>
      )}

      {fillerStats && <FillerSummary stats={fillerStats} />}

      {feedback.strengths.length > 0 && (
        <>
          <div className="feedback-list-title">Strengths</div>
          <ul className="feedback-list">
            {feedback.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {feedback.weaknesses.length > 0 && (
        <>
          <div className="feedback-list-title">Weaknesses</div>
          <ul className="feedback-list">
            {feedback.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {feedback.suggestions.length > 0 && (
        <>
          <div className="feedback-list-title">Suggestions</div>
          <ul className="feedback-list">
            {feedback.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
