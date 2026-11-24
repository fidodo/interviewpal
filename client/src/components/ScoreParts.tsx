// The shared way a marked answer shows its score: what to do next first (the part people act on), then each part's
// points and the reason for them. HowItsMarked shows the same rubric before answering. Used by every section whose
// score is made of parts (server: *.rubric.ts).
import { ImproveStep, RubricGuide } from "../types";

export function ScoreParts({
  guide,
  points,
  reasons,
  steps,
  score,
  deductions = [],
}: {
  guide: RubricGuide;
  points: Record<string, number>;
  reasons?: Record<string, string> | null;
  steps: ImproveStep[];
  score: number;
  // Points taken off, e.g. [{ label: "Hints", points: -1 }]; shown only when not zero.
  deductions?: { label: string; points: number }[];
}) {
  const labelOf = (key: string) => guide.parts.find((p) => p.key === key)?.label ?? deductions.find((d) => d.label.toLowerCase() === key)?.label ?? key;
  const gain = steps.reduce((n, s) => n + s.points, 0);
  const taken = deductions.filter((d) => d.points !== 0);
  return (
    <div className="score-parts">
      {score >= 10 ? (
        <p className="score-parts-full">Full marks: every part of the rubric is covered.</p>
      ) : (
        steps.length > 0 && (
          <div className="score-parts-next">
            <h3 className="feedback-list-title">{score + gain >= 10 ? "How to get a 10" : "How to score higher"}</h3>
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
          </div>
        )
      )}

      <h3 className="feedback-list-title">How your {score} was made</h3>
      <dl className="score-parts-list">
        {guide.parts.map((p) => (
          <div key={p.key} className="score-part">
            <dt>
              {p.label}{" "}
              <span className="score-part-points">
                {points[p.key] ?? 0} of {p.max}
              </span>
            </dt>
            <dd>
              <span className="score-part-bar" aria-hidden="true">
                <span style={{ width: `${((points[p.key] ?? 0) / p.max) * 100}%` }} />
              </span>
              {reasons?.[p.key] && <span className="score-part-reason">{reasons[p.key]}</span>}
            </dd>
          </div>
        ))}
        {taken.map((d) => (
          <div key={d.label} className="score-part">
            <dt>
              {d.label} <span className="score-part-points score-part-minus">{d.points}</span>
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HowItsMarked({ guide, intro }: { guide: RubricGuide; intro?: string }) {
  const total = guide.parts.reduce((n, p) => n + p.max, 0);
  return (
    <details className="how-marked">
      <summary>How it's marked</summary>
      <p className="helper-text">{intro ?? `The score is the parts below added up, out of ${total}.`}</p>
      {guide.parts.map((p) => (
        <div key={p.key} className="how-marked-part">
          <h4>
            {p.label} <span className="helper-text">(up to {p.max})</span>
          </h4>
          <ul>
            {p.bands.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
      {guide.notes?.map((n) => (
        <p key={n} className="helper-text">
          {n}
        </p>
      ))}
    </details>
  );
}
