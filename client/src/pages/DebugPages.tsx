import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { debugApi } from "../api/debug";
import { CopyButton } from "../components/CopyButton";
import { CodeDiff } from "../code/CodeDiff";
import { ScoreBadge } from "../components/ScoreBadge";
import { runTests } from "../code/runTests";
import { RunLanguage } from "../code/protocol";
import { canFormat, FormatError, formatCode } from "../code/formatCode";
import { useElapsed } from "../hooks/useElapsed";
import { DEBUG_LANGUAGES, DebugChallenge, DebugSummary, Difficulty, LEVEL_LABELS } from "../types";

// CodeMirror and the runners are a separate chunk.
const CodeRunner = lazy(() => import("../code/CodeRunner").then((m) => ({ default: m.CodeRunner })));

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const draftKey = (id: string) => `debug-code:${id}`;
// The original code a draft was edited from: if the original changes (old one-line exercises are reformatted on
// first open), the draft no longer lines up with it and is dropped.
const draftBaseKey = (id: string) => `debug-code-base:${id}`;

function writeDraft(id: string, code: string | null, base?: string) {
  try {
    if (code == null) {
      localStorage.removeItem(draftKey(id));
      localStorage.removeItem(draftBaseKey(id));
    } else {
      localStorage.setItem(draftKey(id), code);
      if (base !== undefined) localStorage.setItem(draftBaseKey(id), base);
    }
  } catch {
    // Not remembered; nothing else breaks.
  }
}

const isStack = (x: string | null): x is string => !!x && Object.prototype.hasOwnProperty.call(DEBUG_LANGUAGES, x);

// The stack picked last time, so /debug opens on it. JavaScript the first time.
const STACK_KEY = "debug-language";
function savedStack() {
  try {
    const saved = localStorage.getItem(STACK_KEY);
    return isStack(saved) ? saved : "javascript";
  } catch {
    return "javascript";
  }
}
function saveStack(language: string) {
  try {
    localStorage.setItem(STACK_KEY, language);
  } catch {
    // Not remembered; nothing else breaks.
  }
}

// Writing an exercise is several AI steps, and falls back to slower models when the fast one is busy.
const WRITING_DETAIL =
  "Writing a bug report, code with planted bugs, tests and a reference fix, then checking them. This usually takes 5-20 seconds, and up to a minute when the AI is busy.";
// After this long, the busy note adds that it can take up to a minute.
const SLOW_AFTER_SECONDS = 20;

// Shown while an exercise is being written: what's happening and how long it's taken. Screen readers get the label
// from the page's status region instead, so the ticking seconds aren't read out.
function ProgressCard({ label, seconds, detail }: { label: string; seconds: number; detail: string }) {
  return (
    <div className="progress-card">
      <p className="progress-card-title">
        {label} <span className="helper-text">{seconds}s</span>
      </p>
      <div className="progress-bar" aria-hidden="true">
        <span />
      </div>
      <p className="helper-text">{detail}</p>
    </div>
  );
}

// Resolves to null if the promise takes longer than ms, so a slow Python download never holds up grading.
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer = 0;
  return Promise.race([promise, new Promise<null>((resolve) => (timer = window.setTimeout(() => resolve(null), ms)))]).finally(() => window.clearTimeout(timer));
}

function readDraft(id: string, original: string) {
  try {
    const draft = localStorage.getItem(draftKey(id));
    const base = localStorage.getItem(draftBaseKey(id));
    // Drafts saved before bases were recorded: a one-line draft of what's now multi-line code is stale.
    const stale = base !== null ? base !== original : !!draft && !draft.includes("\n") && original.includes("\n");
    if (stale) {
      writeDraft(id, null);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

// /debug: pick a stack and level, plus your past challenges.
export function DebugPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [language, setLanguage] = useState(() => {
    const fromLink = params.get("language");
    return isStack(fromLink) ? fromLink : savedStack();
  });
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [history, setHistory] = useState<DebugSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = useElapsed(creating);

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
          <select
            id="debug-language"
            className="input"
            value={language}
            disabled={creating}
            onChange={(e) => {
              setLanguage(e.target.value);
              saveStack(e.target.value);
            }}
          >
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
              <button
                key={l}
                type="button"
                className={`segmented-option ${level === l ? "active" : ""}`}
                aria-pressed={level === l}
                disabled={creating}
                onClick={() => setLevel(l)}
              >
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
        {creating && <ProgressCard label="Writing your buggy code…" seconds={seconds} detail={WRITING_DETAIL} />}
        <p className="visually-hidden" role="status">
          {creating ? "Writing your buggy code. This can take up to a minute." : ""}
        </p>
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
                    {c.status === "SUBMITTED" ? `scored ${c.score}/10` : c.status === "REVEALED" ? "answer shown" : "not submitted yet"}
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

// Why the buttons are disabled right now, and for how long. After 20 seconds it says this can take up to a minute.
function BusyNote({ label, seconds }: { label: string; seconds: number }) {
  return (
    <p className="helper-text debug-busy">
      <span className="debug-busy-dot" aria-hidden="true" />
      {label} {seconds}s
      {seconds >= SLOW_AFTER_SECONDS && ". Still working; when the AI is busy this can take up to a minute."}
    </p>
  );
}

// /debug/:id: fix the code, optionally run tests and take hints, then submit for grading.
export function DebugChallengePage() {
  const { id = "" } = useParams();
  const [challenge, setChallenge] = useState<DebugChallenge | null>(null);
  const [code, setCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"hint" | "submit" | "format" | "reveal" | "similar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A message about hints that isn't a new hint (e.g. "your code looks like it fixes every bug").
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  // Code to load into the editor on its next remount (after formatting), instead of the draft or the original.
  const [loadCode, setLoadCode] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const seconds = useElapsed(busy !== null);
  // A fix that's being graded (e.g. the page was reloaded mid-submit): the page checks back until it's done.
  const status = challenge?.status;
  const [gradingStuck, setGradingStuck] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const gradingSeconds = useElapsed(status === "GRADING" && !gradingStuck);
  // Python downloads when the page opens, so the first "Run tests" doesn't wait as long.
  const [preparingPython, setPreparingPython] = useState(false);

  useEffect(() => {
    setChallenge(null);
    setGradingStuck(false);
    setNotice(null);
    debugApi
      .get(id)
      .then((res) => setChallenge(res.challenge))
      .catch((err) => setError(errorMessage(err, "Couldn't load this challenge")));
  }, [id]);

  useEffect(() => {
    if (status !== "GRADING" || gradingStuck) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      // The server lets a claim older than 2 minutes be retaken, so after that the learner can submit again.
      if (Date.now() - started > 150_000) {
        setGradingStuck(true);
        setNotice("Grading is taking much longer than it should. Your code is still here, so submit it again.");
        return;
      }
      debugApi
        .get(id)
        .then((res) => {
          if (res.challenge.status === "GRADING") return;
          if (res.challenge.status === "OPEN") setNotice("Grading didn't finish. Your code is still here, so submit it again.");
          setChallenge(res.challenge);
          // The grading card is gone; move focus to the result (or the notice) so it isn't lost.
          requestAnimationFrame(() => (resultRef.current ?? noticeRef.current)?.focus());
        })
        .catch(() => {
          // Try again on the next tick.
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, status, gradingStuck]);

  const pythonToPrepare = !!challenge && challenge.runnable && challenge.language === "python" && challenge.status === "OPEN";
  useEffect(() => {
    if (!pythonToPrepare) return;
    let cancelled = false;
    setPreparingPython(true);
    import("../kids/runner/runPython")
      .then((m) => m.preparePython())
      // A failed download shows up as an error when the learner presses "Run tests", which tries again.
      .catch(() => undefined)
      .finally(() => !cancelled && setPreparingPython(false));
    return () => {
      cancelled = true;
      setPreparingPython(false);
    };
  }, [pythonToPrepare]);

  async function hint() {
    setBusy("hint");
    setError(null);
    setHintMessage(null);
    try {
      // The server checks the current code, so the hint is for a bug that's still there.
      const res = await debugApi.hint(id, code);
      setChallenge(res.challenge);
      setHintMessage(res.message);
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
    setNotice(null);
    try {
      // Re-run the tests on the exact code being submitted.
      // If the runner can't load, or takes over 20 seconds (a slow Python download), the fix is graded by reading it.
      const run =
        challenge.runnable && challenge.spec ? await within(runTests(challenge.language as RunLanguage, code, challenge.spec), 20_000).catch(() => null) : null;
      const testResults = run && run.total > 0 ? { passed: run.passed, total: run.total } : null;
      const res = await debugApi.submit(id, { code, explanation: explanation.trim(), testResults });
      writeDraft(id, null);
      setChallenge(res.challenge);
      setGradingStuck(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't grade your fix. Try again."));
      // Already being graded (a double submit, or another tab): show that and wait for the result.
      if (err instanceof ApiError && err.status === 409) {
        debugApi
          .get(id)
          .then((res) => {
            setGradingStuck(false);
            setChallenge(res.challenge);
            if (res.challenge.status !== "OPEN") setError(null);
          })
          .catch(() => undefined);
      }
    } finally {
      setBusy(null);
    }
  }

  // "Show me the answer": closes the exercise unscored and shows what was fixed, bug by bug.
  async function reveal() {
    if (!challenge || !window.confirm("You'll see the planted bugs and a fix, and this exercise won't be scored. Show the answer?")) return;
    setBusy("reveal");
    setError(null);
    try {
      const res = await debugApi.reveal(id, code);
      writeDraft(id, null);
      setChallenge(res.challenge);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't show the answer. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function trySimilar() {
    setBusy("similar");
    setError(null);
    try {
      const res = await debugApi.createSimilar(id);
      navigate(`/debug/${res.challenge.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't write a similar exercise. Try again."));
      setBusy(null);
    }
  }

  function reset() {
    if (!challenge || !window.confirm("Put the original buggy code back? Your changes will be lost.")) return;
    writeDraft(id, null);
    setLoadCode(null);
    setEditorKey((k) => k + 1);
  }

  async function format() {
    if (!challenge) return;
    setBusy("format");
    setError(null);
    try {
      const formatted = await formatCode(challenge.language, code);
      writeDraft(id, formatted === challenge.buggyCode ? null : formatted, challenge.buggyCode);
      setLoadCode(formatted);
      setEditorKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof FormatError ? err.message : "Couldn't format the code.");
    } finally {
      setBusy(null);
    }
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
  // A grading claim that's stuck past the server's 2-minute limit can be submitted again.
  const grading = challenge.status === "GRADING" && !gradingStuck;
  const open = challenge.status === "OPEN" || (challenge.status === "GRADING" && gradingStuck);
  // While stuck, the server still has the exercise as GRADING, so hints and "Show me the answer" are refused;
  // only submitting again works.
  const stuck = challenge.status === "GRADING" && gradingStuck;
  const BUSY_LABELS: Record<NonNullable<typeof busy>, string> = {
    hint: "Getting a hint…",
    submit: challenge.runnable ? "Running the tests and grading your fix…" : "Grading your fix…",
    reveal: "Checking your code…",
    similar: "Writing a similar exercise…",
    format: "Formatting…",
  };
  const busyLabel = busy && busy !== "format" ? BUSY_LABELS[busy] : null;

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

      <p className="visually-hidden" role="status">
        {busyLabel ? `${busyLabel} This can take up to a minute.` : grading ? "Your fix is being graded." : (notice ?? "")}
      </p>

      {grading ? (
        <section className="card" aria-labelledby="debug-grading-title">
          <h2 id="debug-grading-title" className="card-title">
            Your fix is being graded…
          </h2>
          <div className="progress-bar" aria-hidden="true">
            <span />
          </div>
          <p className="helper-text">
            {gradingSeconds}s. This page updates by itself when the result is ready, usually within a minute.
          </p>
        </section>
      ) : open ? (
        <>
          <section className="card" aria-labelledby="debug-code-label">
            <div className="code-header">
              <h2 id="debug-code-label" className="code-header-title">
                The code
              </h2>
              <div className="code-header-actions">
                {canFormat(challenge.language) && (
                  <button type="button" className="btn-link btn-link-inline" onClick={format} disabled={busy !== null}>
                    {busy === "format" ? "Formatting…" : "Format code"}
                  </button>
                )}
                <CopyButton text={() => code} label="Copy code" />
                <CopyButton text={challenge.buggyCode} label="Copy the original" />
                <button type="button" className="btn-link btn-link-inline" onClick={reset}>
                  Reset to original
                </button>
              </div>
            </div>
            <Suspense fallback={<p className="helper-text">Loading the code editor…</p>}>
              <CodeRunner
                language={challenge.language}
                spec={challenge.runnable ? challenge.spec : null}
                initialCode={loadCode ?? ((editorKey === 0 && readDraft(id, challenge.buggyCode)) || challenge.buggyCode)}
                editorKey={`${id}:${editorKey}`}
                labelledBy="debug-code-label"
                // Tests run in the browser, so they stay usable during a hint; they wait while the code is being
                // replaced (format) or sent (submit, reveal).
                disabled={busy === "format" || busy === "submit" || busy === "reveal"}
                preparing={preparingPython}
                onCodeChange={(next) => {
                  setCode(next);
                  writeDraft(id, next === challenge.buggyCode ? null : next, challenge.buggyCode);
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
              <p className="helper-text">Stuck? Each hint points you towards a bug that's still in your code, and costs about a point.</p>
            )}
            <p className="helper-text" aria-live="polite">
              {hintMessage}
            </p>
            {challenge.hintsLeft > 0 && (
              <button type="button" className="btn btn-secondary" onClick={hint} disabled={busy !== null}>
                {busy === "hint" ? "Getting a hint…" : `Get a hint (${challenge.hintsLeft} left)`}
              </button>
            )}
            {stuck && <p className="helper-text">Hints come back once your fix is submitted again.</p>}
            {busy === "hint" && <BusyNote label={BUSY_LABELS.hint} seconds={seconds} />}
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
            {notice && (
              <p ref={noticeRef} tabIndex={-1} className="helper-text">
                {notice}
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy !== null || !code.trim()}>
              {busy === "submit" ? (challenge.runnable ? "Running tests and grading…" : "Grading your fix…") : "Submit my fix"}
            </button>
            {!stuck && (
              <button type="button" className="btn btn-secondary btn-block debug-reveal" onClick={reveal} disabled={busy !== null}>
                {busy === "reveal" ? BUSY_LABELS.reveal : "Can't solve it? Show me the answer"}
              </button>
            )}
            {(busy === "submit" || busy === "reveal") && busyLabel && <BusyNote label={busyLabel} seconds={seconds} />}
          </section>
        </>
      ) : result?.revealed ? (
        <section ref={resultRef} tabIndex={-1} className="card debug-result" aria-labelledby="debug-result-title">
          <h2 id="debug-result-title" className="feedback-title">
            Answer shown: you fixed {result.bugsFixed} of {challenge.bugCount} bug{challenge.bugCount === 1 ? "" : "s"}
          </h2>
          <p className="helper-text">Not scored. Try a similar one to practise the same kinds of bug while they're fresh.</p>
          <h3 className="feedback-list-title">Bug by bug</h3>
          <ol className="feedback-list debug-bug-status">
            {result.bugs.map((b, i) => (
              <li key={i}>
                <span className={`badge ${result.fixed?.[i] ? "badge-success" : "badge-warning"}`}>{result.fixed?.[i] ? "Fixed" : "Not fixed yet"}</span> {b}
                {result.bugHints?.[i] && <span className="helper-text"> Hint you had: {result.bugHints[i]}</span>}
              </li>
            ))}
          </ol>
          <CodeDiff
            title="What changed"
            views={[
              { key: "buggy", label: "Buggy code → fix", from: challenge.buggyCode, to: result.referenceFix, sameText: "The fix matches the original code." },
              { key: "yours", label: "Your code → fix", from: result.submittedCode, to: result.referenceFix, sameText: "Your code already matches the fix." },
            ]}
          />
          <div className="debug-copy-row">
            <CopyButton text={result.referenceFix} label="Copy the fix" />
            <CopyButton text={result.submittedCode} label="Copy your code" />
            <CopyButton text={challenge.buggyCode} label="Copy the original buggy code" />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="debug-result-actions">
            <button type="button" className="btn btn-primary" onClick={trySimilar} disabled={busy !== null}>
              {busy === "similar" ? "Writing a similar exercise…" : "Try a similar one"}
            </button>
            <Link to={`/debug?language=${challenge.language}`} className="btn btn-secondary">
              Try another
            </Link>
          </div>
          {busy === "similar" && <ProgressCard label="Writing a similar exercise…" seconds={seconds} detail={WRITING_DETAIL} />}
        </section>
      ) : (
        result && (
          <section ref={resultRef} tabIndex={-1} className="card debug-result" aria-labelledby="debug-result-title">
            <div className="debug-result-head">
              <ScoreBadge score={result.score ?? 0} />
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
            <CodeDiff
              title="A reference fix: what changed"
              views={[
                { key: "buggy", label: "Buggy code → fix", from: challenge.buggyCode, to: result.referenceFix, sameText: "The fix matches the original code." },
                { key: "yours", label: "Your fix → reference", from: result.submittedCode, to: result.referenceFix, sameText: "Your fix matches the reference fix." },
              ]}
            />
            <div className="debug-copy-row">
              <CopyButton text={result.referenceFix} label="Copy the reference fix" />
            </div>
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
