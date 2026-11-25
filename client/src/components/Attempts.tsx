// Improve and resubmit (Debug and System design; server utils/attempts.ts). After a mark the answer stays hidden:
// the learner can improve and resubmit up to 3 times, or open the answer, which ends resubmitting.
import { ReactNode } from "react";
import { ImproveStep, RubricGuide } from "../types";

// "Your scores: 4 → 6 → 8", when there's more than one attempt.
export function AttemptTrail({ history, current }: { history: { attempt: number; score: number }[]; current: number | null }) {
  if (history.length === 0) return null;
  const scores = [...history.map((h) => h.score), ...(current === null ? [] : [current])];
  return (
    <p className="helper-text attempt-trail">
      <span className="visually-hidden">Your scores so far, attempt by attempt: {scores.join(", ")}.</span>
      <span aria-hidden="true">
        Your scores: {scores.map((s, i) => (i === 0 ? `${s}` : ` → ${s}`)).join("")}
      </span>
    </p>
  );
}

// Under a mark: improve and resubmit, or open the answer.
export function ImproveActions({
  attemptsLeft,
  busy,
  answerLabel,
  onImprove,
  onShowAnswer,
}: {
  attemptsLeft: number;
  busy: "improve" | "answer" | null;
  answerLabel: string;
  onImprove: () => void;
  onShowAnswer: () => void;
}) {
  return (
    <div className="improve-actions">
      <h3 className="feedback-list-title">Improve it, or see the answer</h3>
      <p className="helper-text">
        {attemptsLeft > 0
          ? `Work on the steps above and resubmit: your newest mark becomes your score. ${attemptsLeft} resubmit${attemptsLeft === 1 ? "" : "s"} left. Seeing the answer ends resubmitting.`
          : "You've used every resubmit. Your score stays as it is; see the answer to compare."}
      </p>
      <div className="debug-result-actions">
        {attemptsLeft > 0 && (
          <button type="button" className="btn btn-primary" onClick={onImprove} disabled={busy !== null}>
            {busy === "improve" ? "Opening…" : "Improve and resubmit"}
          </button>
        )}
        <button type="button" className={`btn ${attemptsLeft > 0 ? "btn-secondary" : "btn-primary"}`} onClick={onShowAnswer} disabled={busy !== null}>
          {busy === "answer" ? "Opening…" : answerLabel}
        </button>
      </div>
    </div>
  );
}

// While improving: what the last mark said to work on.
export function LastMark({
  guide,
  score,
  attempt,
  attemptsLeft,
  history,
  steps,
  extra,
}: {
  guide: RubricGuide;
  score: number | null;
  attempt: number;
  attemptsLeft: number;
  history: { attempt: number; score: number }[];
  steps: ImproveStep[];
  // Section-specific lines, e.g. design gaps.
  extra?: ReactNode;
}) {
  const labelOf = (key: string) => guide.parts.find((p) => p.key === key)?.label ?? (key === "hints" ? "Hints" : key);
  return (
    // Focused after "Improve and resubmit" (id last-mark), so keyboard and screen-reader users land on it.
    <section id="last-mark" tabIndex={-1} className="card last-mark" aria-labelledby="last-mark-title">
      <h2 id="last-mark-title" className="card-title">
        Attempt {attempt + 1}: your last one scored {score ?? 0}/10
      </h2>
      <AttemptTrail history={history} current={score} />
      {steps.length > 0 ? (
        <>
          <h3 className="feedback-list-title">What to work on</h3>
          <ul className="score-steps">
            {steps.map((s) => (
              <li key={s.part}>
                <span className="score-step-points">+{s.points}</span>
                <span>
                  <strong>{labelOf(s.part)}:</strong> {s.step}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="helper-text">The last mark had no specific steps. Read the rubric under "How it's marked" and strengthen the weakest part.</p>
      )}
      {extra}
      <p className="helper-text">
        This is resubmit {attempt} of 3{attemptsLeft > 1 ? `; ${attemptsLeft - 1} more after this one` : "; it's the last one"}. Your newest mark becomes your score.
      </p>
    </section>
  );
}
