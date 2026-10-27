import { Feedback, FillerStats } from "../types";
import { ScoreBadge, scoreClass } from "./ScoreBadge";

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

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="feedback-list-title">{title}</h3>
      <ul className="feedback-list">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </>
  );
}

export function FeedbackCard({
  feedback,
  fillerStats,
  animate,
}: {
  feedback: Feedback;
  fillerStats?: FillerStats | null;
  animate?: boolean;
}) {
  return (
    <div className={`card ${animate ? "feedback-animate" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ScoreBadge score={feedback.score} animate={animate} />
        <div>
          <h2 className="feedback-title">Feedback on your answer</h2>
          <div className="helper-text">Score out of 10 for this answer</div>
        </div>
      </div>

      {feedback.breakdown && (
        <dl className="breakdown">
          {(Object.entries(feedback.breakdown) as [string, number][]).map(([key, value], i) => (
            <div className="breakdown-row" key={key}>
              <dt className="breakdown-label">{BREAKDOWN_LABELS[key] ?? key}</dt>
              <dd className="breakdown-bar" aria-hidden="true">
                <div
                  className={`breakdown-bar-fill ${scoreClass(value)}`}
                  style={{ width: `${value * 10}%`, animationDelay: `${0.5 + i * 0.15}s` }}
                />
              </dd>
              <dd className="breakdown-value">
                {value}
                <span className="visually-hidden"> out of 10</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {fillerStats && <FillerSummary stats={fillerStats} />}

      <FeedbackList title="Strengths" items={feedback.strengths} />
      <FeedbackList title="Weaknesses" items={feedback.weaknesses} />
      <FeedbackList title="Suggestions" items={feedback.suggestions} />
    </div>
  );
}
