import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { debugApi } from "../api/debug";
import { ScoreBadge } from "../components/ScoreBadge";
import { runTests } from "../code/runTests";
import { RunLanguage } from "../code/protocol";
import { DEBUG_LANGUAGES, DebugChallenge, DebugSummary, Difficulty, LEVEL_LABELS } from "../types";

// CodeMirror and the runners are a separate chunk.
const CodeRunner = lazy(() => import("../code/CodeRunner").then((m) => ({ default: m.CodeRunner })));

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const draftKey = (id: string) => `debug-code:${id}`;

function readDraft(id: string) {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}

function writeDraft(id: string, code: string | null) {
  try {
    if (code == null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), code);
  } catch {
    // Not remembered; nothing else breaks.
  }
}

// /debug: pick a stack and level, plus your past challenges.
export function DebugPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [language, setLanguage] = useState(params.get("language") ?? "python");
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [history, setHistory] = useState<DebugSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    debugApi
      .list()
      .then((res) => setHistory(res.challenges))
      .catch((err) => setError(errorMessage(err, "Couldn't load your challenges")));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { challenge } = await debugApi.create(language, level);
      navigate(`/debug/${challenge.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create a challenge. Try again."));
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Debug practice</h1>
      <p className="page-subtitle">
        Get realistic broken code in your stack, find and fix the bugs, explain what was wrong, and get graded, like a debugging round in an interview.
      </p>

      <form className="card" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="debug-language">Stack</label>
          <select id="debug-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(DEBUG_LANGUAGES).map(([key, { label, runnable }]) => (
              <option key={key} value={key}>
                {label}
                {runnable ? " (runs tests in your browser)" : " (reviewed by AI)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label" id="debug-level-label">
            Level
          </span>
          <div className="segmented" role="group" aria-labelledby="debug-level-label">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`segmented-option ${level === l ? "active" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
          <p className="helper-text">Junior: 1 bug. Mid-level: 2 bugs. Senior: 2-3 subtler bugs.</p>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Writing broken code…" : "Give me buggy code"}
        </button>
      </form>

      <section aria-labelledby="debug-history-title">
        <h2 id="debug-history-title" className="card-title">
          Your challenges
        </h2>
        {!history && !error && <p className="helper-text">Loading…</p>}
        {history?.length === 0 && <p className="helper-text">None yet.</p>}
        {history && history.length > 0 && (
          <ul className="course-list">
            {history.map((c) => (
              <li key={c.id}>
                <Link to={`/debug/${c.id}`} className="card course-item">
                  <span className="course-item-title">{c.title}</span>
                  <span className="helper-text">
                    {DEBUG_LANGUAGES[c.language]?.label ?? c.language} · {LEVEL_LABELS[c.level]} ·{" "}
                    {c.status === "SUBMITTED" ? `scored ${c.score}/10` : "not submitted yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// /debug/:id: fix the code, optionally run tests and take hints, then submit for grading.
export function DebugChallengePage() {
  const { id = "" } = useParams();
  const [challenge, setChallenge] = useState<DebugChallenge | null>(null);
  const [code, setCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState<"hint" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setChallenge(null);
    debugApi
      .get(id)
      .then((res) => setChallenge(res.challenge))
      .catch((err) => setError(errorMessage(err, "Couldn't load this challenge")));
  }, [id]);

  async function hint() {
    setBusy("hint");
    setError(null);
    try {
      setChallenge((await debugApi.hint(id)).challenge);
    } catch (err) {
      setError(errorMessage(err, "Couldn't get a hint"));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!challenge) return;
    setBusy("submit");
    setError(null);
    try {
      // Re-run the tests on the exact code being submitted.
      // If the runner itself can't load, the fix is still graded (by reading it).
      const run = challenge.runnable && challenge.spec ? await runTests(challenge.language as RunLanguage, code, challenge.spec).catch(() => null) : null;
      const testResults = run && run.total > 0 ? { passed: run.passed, total: run.total } : null;
      const res = await debugApi.submit(id, { code, explanation: explanation.trim(), testResults });
      writeDraft(id, null);
      setChallenge(res.challenge);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't grade your fix. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    if (!challenge || !window.confirm("Put the original buggy code back? Your changes will be lost.")) return;
    writeDraft(id, null);
    setEditorKey((k) => k + 1);
  }

  if (!challenge) {
    return (
      <div className="page">
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

  const { result } = challenge;
  const languageLabel = DEBUG_LANGUAGES[challenge.language]?.label ?? challenge.language;
  const open = challenge.status !== "SUBMITTED";

  return (
    <div className="page">
      <Link to={`/debug?language=${challenge.language}`} className="btn-link btn-link-inline">
        ← Debug practice
      </Link>
      <h1 className="page-title">{challenge.title}</h1>
      <div className="history-tags">
        <span className="badge badge-primary">{languageLabel}</span>
        <span className="badge">{LEVEL_LABELS[challenge.level]}</span>
        <span className="badge">
          {challenge.bugCount} bug{challenge.bugCount === 1 ? "" : "s"}
        </span>
      </div>

      <section className="card" aria-labelledby="scenario-title">
        <h2 id="scenario-title" className="card-title">
          The bug report
        </h2>
        <p className="scenario-text">{challenge.scenario}</p>
        {!challenge.runnable && <p className="helper-text">{languageLabel} doesn't run in the browser, so your fix is reviewed by the AI.</p>}
      </section>

      {open ? (
        <>
          <section className="card" aria-labelledby="debug-code-label">
            <div className="code-header">
              <h2 id="debug-code-label" className="code-header-title">
                The code
              </h2>
              <button type="button" className="btn-link btn-link-inline" onClick={reset}>
                Reset to original
              </button>
            </div>
            <Suspense fallback={<p className="helper-text">Loading the code editor…</p>}>
              <CodeRunner
                language={challenge.language}
                spec={challenge.runnable ? challenge.spec : null}
                initialCode={(editorKey === 0 && readDraft(id)) || challenge.buggyCode}
                editorKey={`${id}:${editorKey}`}
                labelledBy="debug-code-label"
                disabled={busy !== null}
                onCodeChange={(next) => {
                  setCode(next);
                  writeDraft(id, next === challenge.buggyCode ? null : next);
                }}
              />
            </Suspense>
          </section>

          <section className="card" aria-labelledby="hints-title">
            <h2 id="hints-title" className="card-title">
              Hints
            </h2>
            {challenge.hints.length > 0 ? (
              <ol className="hint-list">
                {challenge.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
            ) : (
              <p className="helper-text">Stuck? Each hint points you towards one bug, and costs about a point.</p>
            )}
            {challenge.hintsLeft > 0 && (
              <button type="button" className="btn btn-secondary" onClick={hint} disabled={busy !== null}>
                {busy === "hint" ? "Getting a hint…" : `Get a hint (${challenge.hintsLeft} left)`}
              </button>
            )}
          </section>

          <section className="card">
            <div className="field">
              <label htmlFor="debug-explanation">What was wrong, and how did you fix it?</label>
              <textarea
                id="debug-explanation"
                className="input"
                rows={4}
                maxLength={3000}
                placeholder="Explain it the way you would to an interviewer: the symptom, the root cause, and your fix."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </div>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy !== null || !code.trim()}>
              {busy === "submit" ? (challenge.runnable ? "Running tests and grading…" : "Grading your fix…") : "Submit my fix"}
            </button>
          </section>
        </>
      ) : (
        result && (
          <section ref={resultRef} tabIndex={-1} className="card debug-result" aria-labelledby="debug-result-title">
            <div className="debug-result-head">
              <ScoreBadge score={result.score} />
              <div>
                <h2 id="debug-result-title" className="feedback-title">
                  Fixed {result.bugsFixed} of {challenge.bugCount} bug{challenge.bugCount === 1 ? "" : "s"}
                </h2>
                <p className="helper-text">
                  {result.testResults ? `${result.testResults.passed} of ${result.testResults.total} tests passed` : "Reviewed by AI"}
                  {challenge.hints.length > 0 && ` · ${challenge.hints.length} hint${challenge.hints.length === 1 ? "" : "s"} used`}
                </p>
              </div>
            </div>
            <p>{result.feedback}</p>
            {result.missed.length > 0 && (
              <>
                <h3 className="feedback-list-title">What you missed</h3>
                <ul className="feedback-list">
                  {result.missed.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="feedback-list-title">The bugs that were planted</h3>
            <ol className="feedback-list">
              {result.bugs.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            <h3 className="feedback-list-title">A reference fix</h3>
            <pre className="lesson-code" tabIndex={0} aria-label="Reference fix">
              {result.referenceFix}
            </pre>
            <details>
              <summary>Your fix</summary>
              <pre className="lesson-code" tabIndex={0} aria-label="Your fix">
                {result.submittedCode}
              </pre>
              {result.explanation && <p className="review-answer">{result.explanation}</p>}
            </details>
            <Link to={`/debug?language=${challenge.language}`} className="btn btn-primary">
              Try another
            </Link>
          </section>
        )
      )}
    </div>
  );
}
