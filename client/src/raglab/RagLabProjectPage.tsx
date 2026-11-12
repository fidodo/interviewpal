import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { raglabApi } from "../api/raglab";
import { CodeEditor } from "../code/CodeEditor";
import { LessonContent } from "../components/LessonContent";
import { runBot } from "./runtime/runBot";
import { CaseOutput, RunCase, TraceEntry } from "./runtime/protocol";
import { AttemptSummary, GradedAttempt, LANGUAGE_LABELS, Project } from "./types";

import { MAX_TRACE, SAVE_DELAY_MS, errorMessage } from "./ragLabUtils";
import { LevelPath, useLevels } from "./LevelPath";
import { ChecksTable } from "./ChecksTable";

type RunKind = "TRY" | "PRACTICE" | "HELDOUT";

// /rag-lab/:id: the level brief, your code, and running it.
export function RagLabProjectPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { levels } = useLevels();
  const [project, setProject] = useState<Project | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [viewLevel, setViewLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveTimer = useRef<number | undefined>(undefined);

  const [running, setRunning] = useState<RunKind | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState("");
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [graded, setGraded] = useState<GradedAttempt | null>(null);
  const [tryQuestion, setTryQuestion] = useState("How many PTO days do I get?");
  const [tryOutput, setTryOutput] = useState<CaseOutput | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // Leaving the page stops a run; a run stopped that way must not be graded or update the page.
  const leftRef = useRef(false);
  // Stop can be pressed while the run is still starting (saving, creating the attempt), before the bot exists.
  const stopRequestedRef = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const res = await raglabApi.project(id);
    setProject(res.project);
    setAttempts(res.attempts);
    return res.project;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    leftRef.current = false;
    setProject(null);
    raglabApi
      .project(id)
      .then((res) => {
        if (cancelled) return;
        codeRef.current = res.project.code;
        setProject(res.project);
        setAttempts(res.attempts);
        setViewLevel(res.project.level);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load this bot")));
    return () => {
      cancelled = true;
      leftRef.current = true;
      window.clearTimeout(saveTimer.current);
      stopRef.current?.();
    };
  }, [id]);

  const save = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      await raglabApi.saveCode(id, codeRef.current);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [id]);

  function onCodeChange(next: string) {
    if (next === codeRef.current) return;
    codeRef.current = next;
    setSaveState("unsaved");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, SAVE_DELAY_MS);
  }

  function pushTrace(entry: TraceEntry) {
    setTrace((t) => (t.length >= MAX_TRACE ? [...t.slice(1), entry] : [...t, entry]));
    if (entry.kind === "status") setStatus(entry.text);
  }

  async function run(kind: RunKind) {
    if (!project || running) return;
    setRunning(kind);
    setRunError(null);
    setGraded(null);
    setTryOutput(null);
    setTrace([]);
    setStatus("Starting…");
    stopRequestedRef.current = false;
    const stoppedEarly = () => {
      if (!stopRequestedRef.current) return false;
      setRunError("You stopped the run.");
      setStatus("");
      return true;
    };
    try {
      let attemptId: string | null = null;
      let cases: RunCase[] = [{ id: "try", question: tryQuestion.trim(), history: [] }];
      let k = 5;
      if (kind === "TRY") {
        await save();
      } else {
        if (stoppedEarly()) return;
        window.clearTimeout(saveTimer.current);
        const started = await raglabApi.startAttempt(id, kind, codeRef.current);
        setSaveState("saved");
        attemptId = started.attempt.id;
        cases = started.cases;
        k = started.k;
      }
      if (stoppedEarly()) return;
      setProgress({ done: 0, total: cases.length });
      const handle = runBot(project.language, codeRef.current, cases, k, {
        onTrace: pushTrace,
        onCase: () => setProgress((p) => (p ? { ...p, done: p.done + 1 } : p)),
      });
      stopRef.current = handle.stop;
      const result = await handle.result;
      stopRef.current = null;
      if (leftRef.current) return;
      if (kind === "TRY") {
        setTryOutput(result.outputs[0]);
        if (result.error) setRunError(result.error);
        setStatus(result.error ? "The run stopped with an error." : "Done.");
        return;
      }
      if (result.error) setRunError(result.error);
      setStatus("Grading your bot's answers…");
      const g = await raglabApi.grade(attemptId!, result.outputs, result.usage);
      setGraded(g);
      setStatus(g.passed ? "Passed." : "Graded.");
      const fresh = await load();
      if (g.levelUp) setViewLevel(fresh.level);
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (err) {
      setRunError(errorMessage(err, "The run failed. Try again."));
      setStatus("");
    } finally {
      setRunning(null);
      setProgress(null);
    }
  }

  async function remove() {
    if (!project || !window.confirm(`Delete "${project.name}" and all its runs? This can't be undone.`)) return;
    try {
      await raglabApi.deleteProject(id);
      navigate("/rag-lab");
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete this bot"));
    }
  }

  if (!project || !levels) {
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

  const finished = project.level > levels.playableLevels;
  const shown = levels.levels.find((l) => l.number === (viewLevel ?? project.level)) ?? levels.levels[0];
  const current = levels.levels.find((l) => l.number === project.level);
  const label = (n: number) => levels.levels.find((l) => l.number === n)?.title ?? "";

  return (
    <div className="page page-wide">
      <Link to="/rag-lab" className="btn-link btn-link-inline">
        ← RAG Lab
      </Link>
      <h1 className="page-title">{project.name}</h1>
      <div className="history-tags">
        <span className="badge badge-primary">{LANGUAGE_LABELS[project.language]}</span>
        <span className="badge">{finished ? "Every available level passed" : `Level ${project.level}: ${current?.title} (${current?.seniority})`}</span>
      </div>

      <section className="card" aria-labelledby="rl-path-title">
        <h2 id="rl-path-title" className="card-title">
          Your path
        </h2>
        <LevelPath levels={levels.levels} current={project.level} selected={shown.number} onSelect={setViewLevel} />
      </section>

      {finished && (
        <p className="rl-banner" role="status">
          You've passed every level available so far. New levels are on the way; keep improving your bot with practice runs meanwhile.
        </p>
      )}

      {shown.brief && (
        <section className="card" aria-labelledby="rl-brief-title">
          <h2 id="rl-brief-title" className="card-title">
            Level {shown.number}: {shown.title} <span className="badge">{shown.seniority}</span>
          </h2>
          <LessonContent text={shown.brief} />
          <h3 className="feedback-list-title">Requirements</h3>
          <ol className="feedback-list">
            {shown.requirements?.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          <h3 className="feedback-list-title">To pass</h3>
          <ul className="feedback-list">
            {shown.checks?.map((c) => (
              <li key={`${c.metric}:${c.category}`}>{c.label}</li>
            ))}
            {shown.number > 1 && <li>…and every earlier level's checks still pass.</li>}
          </ul>
          {shown.hints && shown.hints.length > 0 && (
            <details className="rl-hints">
              <summary>Hints</summary>
              <ul className="feedback-list">
                {shown.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="rl-code-title">
        <div className="code-header">
          <h2 id="rl-code-title" className="code-header-title">
            {project.language === "python" ? "rag_bot.py" : project.language === "typescript" ? "rag_bot.ts" : "rag_bot.js"}
          </h2>
          <span className="helper-text" role="status">
            {{ saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Couldn't save. It'll retry when you run." }[saveState]}
          </span>
        </div>
        <CodeEditor key={project.id} initialCode={project.code} language={project.language} labelledBy="rl-code-title" onChange={onCodeChange} />
      </section>

      <section className="card" aria-labelledby="rl-run-title">
        <h2 id="rl-run-title" className="card-title">
          Run your bot
        </h2>
        <form
          className="rl-try"
          onSubmit={(e) => {
            e.preventDefault();
            run("TRY");
          }}
        >
          <div className="field">
            <label htmlFor="rl-try-q">Ask your bot a question (not graded)</label>
            <input id="rl-try-q" className="input" maxLength={300} value={tryQuestion} onChange={(e) => setTryQuestion(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={!!running || !tryQuestion.trim()}>
            Ask
          </button>
        </form>
        <div className="dg-actions">
          <button type="button" className="btn btn-secondary" onClick={() => run("PRACTICE")} disabled={!!running || finished}>
            Run practice set
          </button>
          <button type="button" className="btn btn-primary" onClick={() => run("HELDOUT")} disabled={!!running || finished}>
            Submit level {project.level} (unseen questions)
          </button>
          {running && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                stopRequestedRef.current = true;
                stopRef.current?.();
              }}
            >
              Stop
            </button>
          )}
        </div>
        <p className="helper-text">
          Practice shows every question's details. Submitting runs questions your bot hasn't seen and shows only the totals; passing unlocks the next level.
        </p>
        <p className="rl-status" role="status" aria-live="polite">
          {status}
          {progress && progress.total > 0 ? ` (${progress.done} of ${progress.total} answered)` : ""}
        </p>
        {runError && (
          <p className="error-text" role="alert">
            {runError}
          </p>
        )}
        {tryOutput && !tryOutput.error && (
          <div className="rl-try-result">
            <h3 className="feedback-list-title">Your bot's answer</h3>
            <p className="review-answer">{tryOutput.answer || "(empty answer)"}</p>
            <p className="helper-text">
              Retrieved: {tryOutput.retrieved.map((r) => r.docId).join(", ") || "nothing"} · Cited: {tryOutput.citations.join(", ") || "nothing"} · {tryOutput.ms} ms
            </p>
          </div>
        )}
        {tryOutput?.error && (
          <p className="error-text" role="alert">
            {tryOutput.error}
          </p>
        )}
        {trace.length > 0 && (
          <details className="rl-trace-wrap" open={!!running}>
            <summary>Trace ({trace.length} lines)</summary>
            <ol className="rl-trace" tabIndex={0} aria-label="Run trace">
              {trace.map((t, i) => (
                <li key={i} className={`rl-trace-${t.kind}`}>
                  <span className="rl-trace-t">{(t.t / 1000).toFixed(1)}s</span> {t.text}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      {graded && (
        <section ref={resultsRef} tabIndex={-1} className="card debug-result" aria-labelledby="rl-results-title">
          <h2 id="rl-results-title" className="card-title">
            {graded.attempt.kind === "HELDOUT"
              ? graded.passed
                ? `Level ${graded.attempt.level} passed!`
                : `Level ${graded.attempt.level} not passed yet`
              : `Practice run: ${graded.checks.filter((c) => c.passed).length} of ${graded.checks.length} checks pass`}
          </h2>
          {graded.levelUp && (
            <p className="rl-banner" role="status">
              {project.level <= levels.playableLevels ? `Level ${project.level}, "${label(project.level)}", is unlocked. Same bot, higher bar.` : "That was the last level available so far."}
            </p>
          )}
          <ChecksTable checks={graded.checks} caption="Checks for this run" />
          <p className="helper-text">
            {graded.summary.cases} questions · {graded.summary.errors} errors · median {graded.summary.medianMs} ms per question · {graded.usage.llmCalls} model calls (
            {graded.usage.inputTokens + graded.usage.outputTokens} tokens) · {graded.usage.embedCalls} embed calls
          </p>
          {graded.results && (
            <>
              <h3 className="feedback-list-title">Question by question</h3>
              <ul className="rl-cases">
                {graded.results.map((r) => {
                  const ok = r.category === "injection" ? !r.followedInjection && !r.error : r.verdict === "correct";
                  return (
                    <li key={r.caseId}>
                      <details>
                        <summary>
                          <span className={ok ? "rl-pass" : "rl-fail"}>{ok ? "✓" : "✗"}</span> {r.question}
                        </summary>
                        <dl className="rl-case">
                          <dt>Type</dt>
                          <dd>{{ fact: "Answerable", unanswerable: "Not in the documents", injection: "Retrieves the poisoned page" }[r.category]}</dd>
                          {r.expectedDocs.length > 0 && (
                            <>
                              <dt>Expected document</dt>
                              <dd>{r.expectedDocs.join(", ")}</dd>
                            </>
                          )}
                          <dt>Your top results</dt>
                          <dd>
                            {r.retrievedDocs.length
                              ? r.retrievedDocs.map((d, i) => (
                                  <span key={d} className={r.expectedDocs.includes(d) ? "rl-hit" : undefined}>
                                    {i > 0 ? ", " : ""}
                                    {d}
                                    {r.expectedDocs.includes(d) ? " ✓" : ""}
                                  </span>
                                ))
                              : "nothing"}
                          </dd>
                          <dt>Your answer</dt>
                          <dd className="review-answer">{r.error ? `Error: ${r.error}` : r.answer || "(empty)"}</dd>
                          <dt>Cited</dt>
                          <dd>{r.citations.join(", ") || "nothing"}</dd>
                          <dt>Marked</dt>
                          <dd>
                            {r.category === "injection"
                              ? r.followedInjection
                                ? "Followed the injected instruction"
                                : "Didn't follow the injected instruction"
                              : r.verdict}
                            {r.refused ? " · refused" : ""}
                            {r.note ? ` · ${r.note}` : ""}
                          </dd>
                          <dt>Reference answer</dt>
                          <dd>{r.reference}</dd>
                        </dl>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {attempts.length > 0 && (
        <section className="card" aria-labelledby="rl-history-title">
          <h2 id="rl-history-title" className="card-title">
            Past runs
          </h2>
          <ul className="rl-history">
            {attempts.map((a) => (
              <li key={a.id}>
                <span className={a.passed ? "rl-pass" : "rl-fail"}>{a.passed ? "✓" : "✗"}</span> Level {a.level} {a.kind === "HELDOUT" ? "submission" : "practice"} ·{" "}
                {a.metrics ? `${a.metrics.checks.filter((c) => c.passed).length}/${a.metrics.checks.length} checks` : ""} ·{" "}
                <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="btn btn-danger" onClick={remove} disabled={!!running}>
        Delete this bot
      </button>
    </div>
  );
}
