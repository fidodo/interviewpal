import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { LineChart } from "./LineChart";

interface Week {
  start: string;
  interviewScore: number | null;
  interviewCount: number;
  speakScore: number | null;
  speakCount: number;
  fillersPer100: number | null;
  wpm: number | null;
  hedgesPer100: number | null;
}

interface Progress {
  weeks: Week[];
  totals: { answers: number; retakes: number; takes: number; averageRetakeGain: number | null };
}

type MetricKey = "interviewScore" | "speakScore" | "fillersPer100" | "wpm" | "hedgesPer100";

const METRICS: { key: MetricKey; title: string; note: string; empty?: string; yMax: (vals: number[]) => number; format: (v: number) => string; lowerIsBetter?: boolean }[] = [
  { key: "interviewScore", title: "Interview answer score", note: "Average mark out of 10, retakes included.", empty: "No interview answers yet.", yMax: () => 10, format: (v) => `${v}/10` },
  { key: "speakScore", title: "Speak score", note: "Average mark out of 10 for your Speak takes.", empty: "No Speak takes yet.", yMax: () => 10, format: (v) => `${v}/10` },
  {
    key: "fillersPer100",
    title: "Filler words",
    note: "\"Um\", \"like\", \"you know\"… per 100 words spoken. Lower is better.",
    yMax: (vals) => Math.max(4, Math.ceil(Math.max(...vals, 0))),
    format: (v) => `${v} per 100 words`,
    lowerIsBetter: true,
  },
  {
    key: "wpm",
    title: "Speaking pace",
    note: "Words a minute in recorded Speak takes. Around 130–160 is easy to follow.",
    empty: "No recorded Speak takes yet. Typed takes, and recordings under 5 seconds, have no pace.",
    yMax: (vals) => Math.max(200, Math.ceil(Math.max(...vals, 0) / 50) * 50),
    format: (v) => `${v} wpm`,
  },
  {
    key: "hedgesPer100",
    title: "Hedging",
    note: "\"I think\", \"maybe\", \"kind of\"… per 100 words in Speak. Lower sounds more confident.",
    empty: "No Speak takes yet.",
    yMax: (vals) => Math.max(4, Math.ceil(Math.max(...vals, 0))),
    format: (v) => `${v} per 100 words`,
    lowerIsBetter: true,
  },
];

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

// A plain-language reading of the line, used as the chart's text alternative and shown under it.
function describe(values: (number | null)[], labels: string[], format: (v: number) => string, lowerIsBetter?: boolean, empty?: string) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (points.length === 0) return empty ?? "Nothing in the last 12 weeks yet.";
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) return `One week so far: ${format(last.v)} (week of ${labels[last.i]}).`;
  const diff = last.v - first.v;
  const span = `between the weeks of ${labels[first.i]} and ${labels[last.i]}`;
  if (Math.abs(diff) < 0.05) return `Steady at ${format(last.v)} ${span}.`;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return `${diff > 0 ? "Rose" : "Fell"} from ${format(first.v)} to ${format(last.v)} ${span}${better ? ", which is an improvement" : ""}.`;
}

// /progress: weekly trends from interview answers, retakes and Speak takes.
export function ProgressPage() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Progress>("/progress")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your progress."));
  }, []);

  const labels = data?.weeks.map((w) => weekLabel(w.start)) ?? [];
  const empty = data && data.totals.answers + data.totals.takes === 0;

  return (
    <div className="page">
      <h1 className="page-title">Your progress</h1>
      <p className="page-subtitle">How your answers and delivery have moved over the last 12 weeks.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="helper-text" role="status">
          Loading…
        </p>
      )}

      {data && (
        <dl className="stat-tiles">
          <div className="stat-tile">
            <dt>Interview answers</dt>
            <dd>{data.totals.answers}</dd>
          </div>
          <div className="stat-tile">
            <dt>Speak takes</dt>
            <dd>{data.totals.takes}</dd>
          </div>
          <div className="stat-tile">
            <dt>Retakes</dt>
            <dd>{data.totals.retakes}</dd>
          </div>
          <div className="stat-tile">
            <dt>Average gain on a retake</dt>
            <dd>{data.totals.averageRetakeGain == null ? "–" : `${data.totals.averageRetakeGain > 0 ? "+" : ""}${data.totals.averageRetakeGain} points`}</dd>
          </div>
        </dl>
      )}

      {empty && (
        <div className="card empty-state">
          <p>Nothing to chart yet. Answer a few interview questions or tell a story in Speak, and your trends will show up here.</p>
          <div className="btn-full-row">
            <Link className="btn btn-primary" to="/">
              Start an interview
            </Link>
            <Link className="btn btn-secondary" to="/speak">
              Open Speak
            </Link>
          </div>
        </div>
      )}

      {data && !empty && (
        <>
          <div className="progress-charts">
            {METRICS.map((m) => {
              const values = data.weeks.map((w) => w[m.key]);
              const present = values.filter((v): v is number => v != null);
              const summary = describe(values, labels, m.format, m.lowerIsBetter, m.empty);
              return (
                <figure key={m.key} className="card progress-chart">
                  <figcaption>
                    <h2 className="card-title">{m.title}</h2>
                    <p className="helper-text">{m.note}</p>
                  </figcaption>
                  {present.length ? (
                    <LineChart values={values} labels={labels} yMax={m.yMax(present)} format={m.format} summary={`${m.title}. ${summary}`} />
                  ) : null}
                  <p className="progress-summary">{summary}</p>
                </figure>
              );
            })}
          </div>

          <details className="card progress-table">
            <summary>Show the numbers as a table</summary>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly numbers">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    <th scope="col">Answers</th>
                    <th scope="col">Answer score</th>
                    <th scope="col">Speak takes</th>
                    <th scope="col">Speak score</th>
                    <th scope="col">Fillers /100 words</th>
                    <th scope="col">Pace (wpm)</th>
                    <th scope="col">Hedges /100 words</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w, i) => (
                    <tr key={w.start}>
                      <th scope="row">{labels[i]}</th>
                      <td>{w.interviewCount}</td>
                      <td>{w.interviewScore ?? "–"}</td>
                      <td>{w.speakCount}</td>
                      <td>{w.speakScore ?? "–"}</td>
                      <td>{w.fillersPer100 ?? "–"}</td>
                      <td>{w.wpm ?? "–"}</td>
                      <td>{w.hedgesPer100 ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
