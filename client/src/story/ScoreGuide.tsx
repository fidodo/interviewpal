import { DIMENSIONS, Dimension, ScoreGuideData, StoryTake } from "./types";

export function CompareTakes({ takes, onOpenGuide }: { takes: StoryTake[]; onOpenGuide: (d: Dimension) => void }) {
  return (
    // Focusable so keyboard users can scroll it sideways on a phone.
    <div className="rl-table-wrap" tabIndex={0} role="region" aria-label="Scores for each take">
      <table className="rl-table">
        <caption className="visually-hidden">Scores for each take</caption>
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            {takes.map((t) => (
              <th key={t.id} scope="col">
                Take {t.number}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Overall</th>
            {takes.map((t) => (
              <td key={t.id}>{t.score}</td>
            ))}
          </tr>
          {DIMENSIONS.map((d) => (
            <tr key={d.key}>
              <th scope="row">
                {/* Opens this dimension in "What a good score looks like" below. */}
                <a href={`#guide-${d.key}`} onClick={() => onOpenGuide(d.key)}>
                  {d.label}
                </a>
              </th>
              {takes.map((t) => (
                <td key={t.id}>{t.breakdown[d.key]}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">Words a minute</th>
            {takes.map((t) => (
              <td key={t.id}>{t.stats.wpm ?? "–"}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Fillers + hedges</th>
            {takes.map((t) => (
              <td key={t.id}>{t.stats.fillers.count + t.stats.hedges.count}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// "What a good score looks like": for each dimension, what every score band means (the same guide the marker uses),
// where the latest take sits, why the marker gave it that score, and for delivery the measured numbers against
// the targets.
export function ScoreGuide({
  guide,
  take,
  targetSeconds,
  openKeys,
  onToggle,
}: {
  guide: ScoreGuideData;
  take: StoryTake;
  targetSeconds: number;
  openKeys: Set<Dimension>;
  onToggle: (d: Dimension, open: boolean) => void;
}) {
  const { stats, delivery } = take;
  const t = guide.deliveryTargets;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const verdict = { short: "too short", on: "on target", long: "too long" };
  return (
    <>
      <p className="helper-text">
        Each dimension is marked 1-10 against the guide below; the marker reads the same text. Your scores are from take {take.number}, your latest.{" "}
        {guide.overall}
      </p>
      {guide.dimensions.map((d) => {
        const score = take.breakdown?.[d.key];
        // -1 when there's no score (shouldn't happen): no band is marked rather than showing a fake low one.
        const band = typeof score === "number" ? guide.bands.findIndex((b) => score >= b.min && score <= b.max) : -1;
        const next = band >= 0 && band < guide.bands.length - 1 ? band + 1 : null;
        const reason = take.reasons?.[d.key];
        return (
          <details
            key={d.key}
            id={`guide-${d.key}`}
            className="st-guide"
            open={openKeys.has(d.key)}
            onToggle={(e) => onToggle(d.key, (e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>
              <strong>{d.label}</strong>: {band >= 0 ? `your last take ${score}/10, ${guide.bands[band].label}` : "not scored"}
            </summary>
            {reason && (
              <p>
                <strong>Why {score}:</strong> {reason}
              </p>
            )}
            <ol className="st-guide-bands">
              {guide.bands.map((b, i) => (
                <li key={b.label} className={i === band ? "st-guide-current" : undefined}>
                  <span className="st-guide-range">
                    {b.min}-{b.max} {b.label}
                    {i === band && <span className="st-guide-here">You're here</span>}
                  </span>
                  {d.bands[i]}
                </li>
              ))}
            </ol>
            {next !== null && (
              <p>
                <strong>To reach {guide.bands[next].min}:</strong> {d.bands[next]}
              </p>
            )}
            {d.key === "delivery" && delivery && (
              <>
                <h4 className="feedback-list-title">Your take {take.number}, measured</h4>
                <ul className="feedback-list">
                  <li>
                    Length: {delivery.lengthPercent}% of the {targetSeconds}s target (aim for {pct(t.lengthShare[0])}-{pct(t.lengthShare[1])}),{" "}
                    {verdict[delivery.length]}
                    {!stats.timed && " (estimated from your word count, because this take was typed)"}
                  </li>
                  <li>
                    {stats.wpm === null
                      ? "Pace: not measured, because this take was typed"
                      : `Pace: ${stats.wpm} words a minute (comfortable is ${t.wpm[0]}-${t.wpm[1]}). It's counted from the transcript, so words the browser missed make it look slower.`}
                  </li>
                  <li>
                    Fillers and hedges together: {delivery.fillersPer100.toFixed(1)} per 100 words (aim for under {t.fillersPer100}),{" "}
                    {delivery.fillersOk ? "on target" : "too many"}
                  </li>
                  {stats.voice && (
                    <li>
                      Voice, from the recording: {stats.voice.pauses.count} pause{stats.voice.pauses.count === 1 ? "" : "s"}
                      {stats.voice.pitchRangeSemitones !== null && `, pitch range ${stats.voice.pitchRangeSemitones} semitones`}. These shape the marker's comments, not
                      the delivery score.
                    </li>
                  )}
                </ul>
              </>
            )}
          </details>
        );
      })}
    </>
  );
}
