import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { kidsApi } from "../api";
import { getKidLock, kidHomePath } from "../kidMode";
import { EMPTY_DRAWING } from "../runner/protocol";
import { AskPal } from "../components/AskPal";
import { Stars } from "../components/bits";
import { TurtleCanvas } from "../runner/TurtleCanvas";
import { describeDrawing, preparePython, RunResult, runPython } from "../runner/runPython";
import { Attempt, ChallengeDetail } from "../types";

// Each editor is its own chunk: Blockly is large and only needed on block levels, CodeMirror only on Python ones.
const BlocksEditor = lazy(() => import("../editors/BlocksEditor").then((m) => ({ default: m.BlocksEditor })));
const PythonEditor = lazy(() => import("../editors/PythonEditor").then((m) => ({ default: m.PythonEditor })));

type PythonState = "loading" | "ready" | "error";

interface CheckResult {
  attempt: Attempt;
  leveledUp: boolean;
  courseComplete: boolean;
}

const draftKey = (id: string) => `kids-code:${id}`;
const blocksKey = (id: string) => `kids-blocks:${id}`;

function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}

function writeDraft(id: string, code: string) {
  try {
    localStorage.setItem(draftKey(id), code);
  } catch {
    // Not remembered between visits; nothing else breaks.
  }
}

function clearSaved(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
    localStorage.removeItem(blocksKey(id));
  } catch {
    // Nothing saved.
  }
}

export function ChallengePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pythonState, setPythonState] = useState<PythonState>("loading");
  const [run, setRun] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showPython, setShowPython] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [moving, setMoving] = useState(false);
  const [code, setCode] = useState("");
  const codeRef = useRef("");

  useEffect(() => {
    setDetail(null);
    setRun(null);
    setResult(null);
    setError(null);
    setEditorKey(0);
    codeRef.current = "";
    kidsApi
      .challenge(id)
      .then((d) => {
        // In kid mode, a learner can only open their own challenges.
        const lock = user ? getKidLock(user.id) : null;
        if (lock && lock !== d.child.id) {
          navigate(kidHomePath(lock), { replace: true });
          return;
        }
        setDetail(d);
        const last = d.attempts[d.attempts.length - 1];
        if (last) setResult({ attempt: last, leveledUp: false, courseComplete: false });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this challenge"));
  }, [id, user, navigate]);

  useEffect(() => {
    preparePython()
      .then(() => setPythonState("ready"))
      .catch(() => setPythonState("error"));
  }, []);

  const handleCodeChange = useCallback(
    (next: string) => {
      codeRef.current = next;
      setCode(next);
      if (detail?.level.editor === "PYTHON") writeDraft(id, next);
    },
    [id, detail?.level.editor],
  );

  async function execute(): Promise<RunResult | null> {
    if (!codeRef.current.trim()) {
      setRun({
        stdout: "",
        error: detail?.level.editor === "BLOCKS" ? "Add some blocks first!" : "Write some code first!",
        drawing: EMPTY_DRAWING,
      });
      return null;
    }
    setRunning(true);
    try {
      const res = await runPython(codeRef.current);
      setRun(res);
      setPythonState("ready");
      return res;
    } catch (err) {
      setPythonState("error");
      setRun({
        stdout: "",
        error: err instanceof Error ? err.message : "Couldn't run your code",
        drawing: EMPTY_DRAWING,
      });
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function check() {
    const res = await execute();
    if (!res || !detail) return;
    setChecking(true);
    try {
      const checked = await kidsApi.submit(id, {
        code: codeRef.current,
        output: res.stdout,
        error: res.error,
        turtle: describeDrawing(res.drawing),
      });
      setResult(checked);
      if (checked.attempt.passed) {
        setDetail({ ...detail, challenge: { ...detail.challenge, status: "PASSED" } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pal couldn't check your work. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function goToNext(fresh: boolean) {
    if (!detail) return;
    setMoving(true);
    setError(null);
    try {
      const { challenge } = await kidsApi.nextChallenge(detail.child.id, detail.course.slug, fresh);
      navigate(`/kids/challenge/${challenge.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pal couldn't make a new challenge. Try again.");
    } finally {
      setMoving(false);
    }
  }

  function startOver() {
    if (!window.confirm("Start over? Your work on this challenge will be cleared.")) return;
    clearSaved(id);
    setRun(null);
    setEditorKey((k) => k + 1);
  }

  if (error && !detail) {
    return (
      <div className="kids-page">
        <p className="error-text" role="alert">
          {error}
        </p>
        <Link to="/kids">Back to the start</Link>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="kids-page">
        <p className="helper-text">Loading your challenge…</p>
      </div>
    );
  }

  const { challenge, level, child, course } = detail;
  const isBlocks = level.editor === "BLOCKS";
  const passed = challenge.status === "PASSED";
  const busy = running || checking;
  const showCanvas = challenge.kind === "DRAW" || (run?.drawing.lines.length ?? 0) > 0;

  return (
    <div className="kids-page kids-page-wide">
      <Link to={`/kids/learn/${child.id}/${course.slug}`} className="btn-link kids-back">
        ← Level map
      </Link>

      <div className="challenge-layout">
        <div className="challenge-main">
          <section className="kids-card challenge-brief" aria-labelledby="challenge-title">
            <p className="challenge-level">
              Level {level.order}: {level.title}{" "}
              <span className={`editor-badge editor-${level.editor.toLowerCase()}`}>{isBlocks ? "Blocks" : "Python"}</span>
            </p>
            <h1 id="challenge-title" className="kids-title">
              {challenge.title}
            </h1>
            <p className="challenge-story">{challenge.story}</p>
            <h2 className="visually-hidden">What to do</h2>
            <p className="challenge-instructions">{challenge.instructions}</p>
          </section>

          <section className="kids-card" aria-labelledby="editor-title">
            <div className="editor-toolbar">
              <h2 id="editor-title" className="kids-card-title">
                {isBlocks ? "Your blocks" : "Your code"}
              </h2>
              <div className="editor-actions">
                {isBlocks && (
                  <button type="button" className="btn btn-secondary" aria-pressed={showPython} onClick={() => setShowPython((v) => !v)}>
                    Peek at the Python
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={startOver} disabled={busy}>
                  Start over
                </button>
              </div>
            </div>

            <Suspense fallback={<p className="helper-text editor-loading">Loading the editor…</p>}>
              {isBlocks ? (
                <BlocksEditor key={`${id}:${editorKey}`} toolbox={level.toolbox} storageKey={blocksKey(id)} onCodeChange={handleCodeChange} />
              ) : (
                <PythonEditor
                  key={`${id}:${editorKey}`}
                  initialCode={(editorKey === 0 && readDraft(id)) || challenge.starterCode}
                  onChange={handleCodeChange}
                  labelledBy="editor-title"
                />
              )}
            </Suspense>

            {isBlocks && showPython && (
              <div className="python-peek">
                <h3 className="python-peek-title">The Python your blocks make</h3>
                <pre>
                  <code>{code.trim() || "# Snap some blocks together to see Python here"}</code>
                </pre>
              </div>
            )}

            <div className="run-bar">
              <button type="button" className="btn btn-secondary kids-run" onClick={execute} disabled={busy || pythonState === "loading"}>
                <span aria-hidden="true">▶</span> {running && !checking ? "Running…" : "Run"}
              </button>
              <button type="button" className="btn btn-primary kids-check" onClick={check} disabled={busy || pythonState === "loading"}>
                {checking ? "Pal is checking…" : "I'm done, check it!"}
              </button>
              <span className="helper-text" role="status">
                {pythonState === "loading"
                  ? "Getting Python ready…"
                  : pythonState === "error"
                    ? "Python couldn't load. Check your internet and try Run again."
                    : ""}
              </span>
            </div>
          </section>

          {run && (
            <section className="kids-card run-output" aria-labelledby="output-title">
              <h2 id="output-title" className="kids-card-title">
                What happened
              </h2>
              <div role="status">
                {showCanvas && <TurtleCanvas drawing={run.drawing} />}
                {run.stdout && (
                  <>
                    <h3 className="output-label">Printed:</h3>
                    <pre className="console-output">{run.stdout}</pre>
                  </>
                )}
                {run.error && (
                  <div className="run-error">
                    <h3 className="output-label">Oops! Something went wrong</h3>
                    <pre>{run.error}</pre>
                  </div>
                )}
                {!run.stdout && !run.error && !showCanvas && <p className="helper-text">Your program ran but didn't print anything.</p>}
              </div>
            </section>
          )}
        </div>

        <aside className="challenge-side">
          {result && (
            <section className={`kids-card check-result ${result.attempt.passed ? "is-passed" : ""}`} aria-labelledby="result-title" role="status">
              <h2 id="result-title" className="kids-card-title">
                {result.attempt.passed ? "You did it!" : "Not quite yet"}
              </h2>
              <Stars count={result.attempt.stars} />
              <p>{result.attempt.praise}</p>
              {result.attempt.nextStep && (
                <p className="next-step">
                  <strong>{result.attempt.passed ? "Try this next: " : "Hint: "}</strong>
                  {result.attempt.nextStep}
                </p>
              )}
              {result.leveledUp && <p className="level-up">Level up! You unlocked level {level.order + 1}. 🎉</p>}
              {result.courseComplete && <p className="level-up">You finished the whole course. Amazing work! 🏆</p>}
            </section>
          )}

          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}

          <div className="next-actions">
            {passed ? (
              <button type="button" className="btn btn-primary btn-block" onClick={() => goToNext(false)} disabled={moving}>
                {moving ? "Pal is making your next challenge…" : "Next challenge →"}
              </button>
            ) : (
              <button type="button" className="btn-link" onClick={() => goToNext(true)} disabled={moving}>
                {moving ? "Making a new challenge…" : "Try a different challenge"}
              </button>
            )}
          </div>

          <AskPal key={id} challengeId={id} getCode={() => codeRef.current} initialMessages={detail.messages} childName={child.displayName} />
        </aside>
      </div>
    </div>
  );
}
