import { Feedback } from "../types";

function scoreClass(score: number): string {
  if (score >= 7) return "score-high";
  if (score >= 4) return "score-mid";
  return "score-low";
}

export function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className={`score-badge ${scoreClass(feedback.score)}`}>{feedback.score}</div>
        <div>
          <div style={{ fontWeight: 700 }}>Feedback on your answer</div>
          <div className="helper-text">Score out of 10 for this answer</div>
        </div>
      </div>

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
