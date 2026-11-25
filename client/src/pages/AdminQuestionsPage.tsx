import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { PoolStatus, poolApi, StepResult } from "../api/pool";
import { useAuth } from "../hooks/useAuth";
import { SubmissionReview } from "./SubmissionReview";

const KIND_LABEL = { INTERVIEW: "Interview questions", DEBUG: "Debug exercises", DESIGN: "System design" } as const;
const LEVELS = ["JUNIOR", "INTERMEDIATE", "SENIOR"] as const;
const LEVEL_LABEL: Record<string, string> = { JUNIOR: "Junior", INTERMEDIATE: "Intermediate", SENIOR: "Senior" };
const PHASE_LABEL: Record<string, string> = {
  sources: "Checking GitHub sources",
  import: "Reading questions from GitHub",
  classify: "Sorting imported questions into topics",
  improve: "Retiring questions marked not realistic",
  fill: "Writing questions for thin topics",
  done: "Finished",
};

function message(err: unknown) {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

// /admin/questions: the shared question pool. Admin only (the server answers 404 to anyone else).
export function AdminQuestionsPage() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return (
      <div className="page">
        <h1 className="page-title">Not found</h1>
        <p>
          This page doesn't exist. <Link to="/">Go to your dashboard</Link>
        </p>
      </div>
    );
  }
  return <AdminQuestions />;
}

function AdminQuestions() {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState(40);
  const [run, setRun] = useState<(StepResult & { id: string }) | null>(null);
  const [switching, setSwitching] = useState(false);
  // Stops the step loop when the page closes or the admin cancels.
  const stopped = useRef(false);

  const load = useCallback(async () => {
    try {
      setStatus(await poolApi.status());
    } catch (err) {
      setError(message(err));
    }
  }, []);

  useEffect(() => {
    stopped.current = false;
    load();
    return () => {
      stopped.current = true;
    };
  }, [load]);

  async function toggleServing() {
    if (!status) return;
    setSwitching(true);
    setError(null);
    try {
      setStatus(await poolApi.setServing(!status.serving));
    } catch (err) {
      setError(message(err));
    } finally {
      setSwitching(false);
    }
  }

  // Steps a run until it finishes, is stopped, or the page closes. Also continues a run left unfinished (a closed tab).
  async function stepLoop(runId: string, phase = "sources") {
    let result: StepResult = { busy: false, status: "RUNNING", aiCalls: 0, added: 0, retired: 0, log: [], phase };
    setRun({ ...result, id: runId });
    while (!stopped.current && result.status === "RUNNING") {
      result = await poolApi.step(runId);
      setRun({ ...result, id: runId });
      // Another tab is working on this step: wait a moment instead of hammering.
      if (result.busy) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function update() {
    setError(null);
    stopped.current = false;
    try {
      const { runId } = await poolApi.start(cap);
      await stepLoop(runId);
    } catch (err) {
      setError(message(err));
    } finally {
      load();
    }
  }

  async function resume(runId: string, phase: string) {
    setError(null);
    stopped.current = false;
    try {
      await stepLoop(runId, phase);
    } catch (err) {
      setError(message(err));
    } finally {
      load();
    }
  }

  async function cancel(runId = run?.id) {
    if (!runId) return;
    stopped.current = true;
    try {
      await poolApi.cancel(runId);
    } catch (err) {
      setError(message(err));
    }
    load();
  }

  if (!status) {
    return (
      <div className="page">
        <h1 className="page-title">Question pool</h1>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : (
          <p className="helper-text">Loading…</p>
        )}
      </div>
    );
  }

  const count = (kind: string, level: string) => status.counts.find((c) => c.kind === kind && c.level === level)?.count ?? 0;
  const running = run?.status === "RUNNING";
  const lastLine = run?.log[run.log.length - 1];
  // A run still marked running that this page isn't driving: left by a closed tab or another device.
  const unfinished = !running ? status.runs.find((r) => r.status === "RUNNING") : undefined;

  return (
    <div className="page">
      <h1 className="page-title">Question pool</h1>
      <p className="page-subtitle">
        Questions everyone is given without an AI call. Marking, follow-ups and target-role practice still use the AI.
      </p>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-labelledby="pool-serve-title">
        <h2 id="pool-serve-title" className="card-title">
          Serving from the pool: {status.serving ? "on" : "off"}
        </h2>
        <p className="helper-text">
          {status.serving
            ? "Quick practice (preset topics, Balanced interviewer), new Debug exercises and System design without a topic come from the pool. Anything the pool doesn't have is written by the AI, as before."
            : "Off: every question is written by the AI, exactly as before the pool existed."}
        </p>
        <button type="button" className={`btn ${status.serving ? "btn-secondary" : "btn-primary"}`} onClick={toggleServing} disabled={switching}>
          {status.serving ? "Turn off" : "Turn on"}
        </button>
      </section>

      <section className="card" aria-labelledby="pool-counts-title">
        <h2 id="pool-counts-title" className="card-title">
          What's in the pool
        </h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="pool-counts-title">
          <table>
            <thead>
              <tr>
                <th scope="col">Section</th>
                {LEVELS.map((l) => (
                  <th key={l} scope="col">
                    {LEVEL_LABEL[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
                <tr key={kind}>
                  <th scope="row">{KIND_LABEL[kind]}</th>
                  {LEVELS.map((l) => (
                    <td key={l}>{count(kind, l)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="helper-text">
          {status.slots.full} of {status.slots.total} slots (topic, language or level) are full; {status.slots.empty} are empty.
        </p>
      </section>

      <section className="card" aria-labelledby="pool-update-title">
        <h2 id="pool-update-title" className="card-title">
          Update questions
        </h2>
        <p className="helper-text">
          Checks the GitHub sources for new questions, retires ones most people marked "Not realistic", then writes questions for the thinnest
          topics. Each AI call counts against your providers' free allowance.
        </p>
        {status.trends.ageDays > 120 && (
          <p className="helper-text">
            The current-interview trends list is from {status.trends.updatedOn} ({status.trends.ageDays} days old). Review it in
            server/src/ai/interviewTrends.ts.
          </p>
        )}
        <div className="field">
          <label htmlFor="pool-cap">At most this many AI calls</label>
          <input
            id="pool-cap"
            type="number"
            className="input"
            min={1}
            max={200}
            value={cap}
            onChange={(e) => setCap(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
            disabled={running}
            style={{ maxWidth: 120 }}
          />
        </div>
        {unfinished ? (
          <>
            <p>
              An update started {new Date(unfinished.startedAt).toLocaleString()} didn't finish (the page was closed, or it's running in another
              tab).
            </p>
            <div className="debug-copy-row">
              <button type="button" className="btn btn-primary" onClick={() => resume(unfinished.id, unfinished.phase)}>
                Continue it
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => cancel(unfinished.id)}>
                Stop it
              </button>
            </div>
          </>
        ) : (
          <div className="debug-copy-row">
            <button type="button" className="btn btn-primary" onClick={update} disabled={running}>
              {running ? "Updating…" : "Check for updates"}
            </button>
            {running && (
              <button type="button" className="btn btn-secondary" onClick={() => cancel()}>
                Stop
              </button>
            )}
          </div>
        )}
        {run && (
          <div className="pool-run">
            <p>
              <strong>{PHASE_LABEL[run.phase] ?? run.phase}</strong>
              {" · "}
              {run.aiCalls} of {cap} AI calls · {run.added} added · {run.retired} retired
              {run.status !== "RUNNING" && ` · ${run.status === "DONE" ? "finished" : run.status.toLowerCase()}`}
            </p>
            <p className="visually-hidden" aria-live="polite">
              {lastLine}
            </p>
            <ol className="pool-log" tabIndex={0} aria-label="Update log">
              {run.log.slice(-30).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <SubmissionReview />

      <section className="card" aria-labelledby="pool-sources-title">
        <h2 id="pool-sources-title" className="card-title">
          Sources
        </h2>
        <ul className="feedback-list">
          {status.sources.map((s) => (
            <li key={s.id}>
              <a href={`https://github.com/${s.repo}`} target="_blank" rel="noreferrer">
                {s.label}
              </a>{" "}
              ({s.licence}) — {s.saved?.lastCommit ? `imported at ${s.saved.lastCommit.slice(0, 7)}` : "not imported yet"}
              {s.saved?.lastError && <span className="error-text"> Last problem: {s.saved.lastError}</span>}
            </li>
          ))}
        </ul>
      </section>

      {status.runs.length > 0 && (
        <section className="card" aria-labelledby="pool-runs-title">
          <h2 id="pool-runs-title" className="card-title">
            Recent updates
          </h2>
          <ul className="feedback-list">
            {status.runs.map((r) => (
              <li key={r.id}>
                {new Date(r.startedAt).toLocaleString()}: {r.status.toLowerCase()}, {r.added} added, {r.retired} retired, {r.aiCalls} AI calls
              </li>
            ))}
          </ul>
        </section>
      )}

      <p>
        <Link to="/account">Back to your account</Link>
      </p>
    </div>
  );
}
