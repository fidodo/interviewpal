import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { designApi } from "../api/design";
import { ScoreBadge } from "../components/ScoreBadge";
import { AttemptTrail, ImproveActions, LastMark } from "../components/Attempts";
import { HowItsMarked, ScoreParts } from "../components/ScoreParts";
import { PoolNote } from "../components/PoolNote";
import { DesignCanvas, DiagramView } from "../design/DesignCanvas";
import { COMPONENT_KINDS, Diagram, MAX_LABEL } from "../design/kinds";
import { DesignChallenge, DesignSummary, Difficulty, LEVEL_LABELS } from "../types";

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const MAX_NOTES = 6000;
const EMPTY: Diagram = { nodes: [], edges: [] };
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const draftKey = (id: string) => `design-draft:${id}`;

type Draft = { diagram: Diagram; notes: string };

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Drafts come from localStorage, which may hold an older or corrupted copy, so keep only well-formed parts.
function readDraft(id: string): Draft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const nodes = (Array.isArray(raw.diagram?.nodes) ? raw.diagram.nodes : []).filter(
      (n: any) => typeof n?.id === "string" && n.kind in COMPONENT_KINDS && typeof n.label === "string" && isNumber(n.x) && isNumber(n.y)
    ) as Diagram["nodes"];
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (Array.isArray(raw.diagram?.edges) ? raw.diagram.edges : []).filter(
      (e: any) => typeof e?.id === "string" && ids.has(e.from) && ids.has(e.to) && e.from !== e.to && typeof e.label === "string"
    ) as Diagram["edges"];
    return {
      diagram: { nodes: nodes.map((n) => ({ ...n, label: n.label.slice(0, MAX_LABEL) })), edges: edges.map((e) => ({ ...e, label: e.label.slice(0, MAX_LABEL) })) },
      notes: typeof raw.notes === "string" ? raw.notes : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft == null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // Not remembered; nothing else breaks.
  }
}

// /design: pick a level and (optionally) what to design, plus your past questions.
export function DesignPage() {
  const navigate = useNavigate();
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [topic, setTopic] = useState("");
  const [history, setHistory] = useState<DesignSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    designApi
      .list()
      .then((res) => setHistory(res.challenges))
      .catch((err) => setError(errorMessage(err, "Couldn't load your design questions")));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { challenge } = await designApi.create(level, topic.trim());
      navigate(`/design/${challenge.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't write a question. Try again."));
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">System design</h1>
      <p className="page-subtitle">
        Get a system design interview question, sketch your architecture on a canvas, explain your choices, and get marked the way an interviewer would.
      </p>

      <form className="card" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="design-topic">What to design (optional)</label>
          <input
            id="design-topic"
            className="input"
            maxLength={120}
            placeholder="e.g. a URL shortener, Instagram's feed, a rate limiter. Leave blank for a surprise."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label" id="design-level-label">
            Level
          </span>
          <div className="segmented" role="group" aria-labelledby="design-level-label">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`segmented-option ${level === l ? "active" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
          <p className="helper-text">Junior: thousands of users. Mid-level: millions. Senior: global scale, with consistency and failure trade-offs.</p>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Writing the question…" : "Give me a design question"}
        </button>
      </form>

      <section aria-labelledby="design-history-title">
        <h2 id="design-history-title" className="card-title">
          Your design questions
        </h2>
        {!history && !error && <p className="helper-text">Loading…</p>}
        {history?.length === 0 && <p className="helper-text">None yet.</p>}
        {history && history.length > 0 && (
          <ul className="course-list">
            {history.map((c) => (
              <li key={c.id}>
                <Link to={`/design/${c.id}`} className="card course-item">
                  <span className="course-item-title">{c.title}</span>
                  <span className="helper-text">
                    {LEVEL_LABELS[c.level]} · {c.status === "SUBMITTED" ? `scored ${c.score}/10` : c.score != null ? `improving, last scored ${c.score}/10` : "not submitted yet"}
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

const BREAKDOWN_LABELS = { requirements: "Requirements", architecture: "Architecture", scalability: "Scale & reliability", tradeoffs: "Trade-offs" } as const;

// /design/:id: draw the design and write notes, take hints, then submit for marking.
export function DesignChallengePage() {
  const { id = "" } = useParams();
  const [challenge, setChallenge] = useState<DesignChallenge | null>(null);
  const [diagram, setDiagram] = useState<Diagram>(EMPTY);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"hint" | "submit" | "improve" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setChallenge(null);
    setError(null);
    setDirty(false);
    const draft = readDraft(id);
    setDiagram(draft?.diagram ?? EMPTY);
    setNotes(draft?.notes ?? "");
    designApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        setChallenge(res.challenge);
        // Being improved after a mark, with no draft in this browser: start from the design that was marked.
        const prev = res.challenge.status === "OPEN" ? res.challenge.previous : null;
        if (prev && !draft) {
          setDiagram(prev.diagram);
          setNotes(prev.notes);
        }
      })
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load this question")));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The draft is written a moment after the last change, not on every pointer move while dragging.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => writeDraft(id, diagram.nodes.length || notes ? { diagram, notes } : null), 400);
    return () => window.clearTimeout(timer);
  }, [id, diagram, notes, dirty]);

  function save(next: Draft) {
    setDiagram(next.diagram);
    setNotes(next.notes);
    setDirty(true);
  }

  async function hint() {
    setBusy("hint");
    setError(null);
    try {
      setChallenge((await designApi.hint(id)).challenge);
    } catch (err) {
      setError(errorMessage(err, "Couldn't get a hint"));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    try {
      const clean: Diagram = {
        nodes: diagram.nodes.map((n) => ({ ...n, label: n.label.trim(), x: Math.round(n.x), y: Math.round(n.y) })),
        edges: diagram.edges.map((e) => ({ ...e, label: e.label.trim() })),
      };
      const res = await designApi.submit(id, { diagram: clean, notes: notes.trim() });
      if (res.challenge.status === "SUBMITTED") {
        setDirty(false);
        writeDraft(id, null);
      }
      setChallenge(res.challenge);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't mark your design. Try again."));
    } finally {
      setBusy(null);
    }
  }

  // "Improve and resubmit": back to the canvas, starting from the design that was marked.
  async function improve() {
    setBusy("improve");
    setError(null);
    try {
      const res = await designApi.improve(id);
      writeDraft(id, null);
      setDirty(false);
      if (res.challenge.previous) {
        setDiagram(res.challenge.previous.diagram);
        setNotes(res.challenge.previous.notes);
      }
      setChallenge(res.challenge);
      requestAnimationFrame(() => document.getElementById("last-mark")?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't reopen this question. Try again."));
    } finally {
      setBusy(null);
    }
  }

  // The model answer after a mark (or while improving one): the last mark stays as the score, and resubmitting ends.
  async function showAnswer() {
    if (!challenge) return;
    const score = challenge.result?.score ?? challenge.previous?.score ?? 0;
    if (!window.confirm(`Your score stays at ${score}/10 and you won't be able to resubmit this design. Show the model answer?`)) return;
    setBusy("answer");
    setError(null);
    try {
      const res = await designApi.answer(id);
      writeDraft(id, null);
      setDirty(false);
      setChallenge(res.challenge);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't show the model answer. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function clear() {
    if (!window.confirm("Clear your diagram? Your notes are kept.")) return;
    save({ diagram: EMPTY, notes });
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

  const { result, requirements } = challenge;
  const open = challenge.status !== "SUBMITTED";
  const previous = challenge.previous ?? null;

  return (
    <div className="page page-wide">
      <Link to="/design" className="btn-link btn-link-inline">
        ← System design
      </Link>
      <h1 className="page-title">{challenge.title}</h1>
      <div className="history-tags">
        <span className="badge badge-primary">System design</span>
        <span className="badge">{LEVEL_LABELS[challenge.level]}</span>
      </div>

      <section className="card" aria-labelledby="brief-title">
        <h2 id="brief-title" className="card-title">
          The question
        </h2>
        <p className="scenario-text">{challenge.brief}</p>
        <PoolNote pool={challenge.poolItemId ? { itemId: challenge.poolItemId } : null} />
        <h3 className="feedback-list-title">Functional requirements</h3>
        <ul className="requirement-list">
          {requirements.functional.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <h3 className="feedback-list-title">Non-functional requirements</h3>
        <ul className="requirement-list">
          {requirements.nonFunctional.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      {open ? (
        <>
          {previous && (
            <LastMark
              guide={challenge.guide}
              score={previous.score}
              attempt={previous.attempt}
              attemptsLeft={previous.attemptsLeft}
              history={previous.history}
              steps={previous.toImprove}
              extra={
                previous.gaps.length > 0 && (
                  <>
                    <h3 className="feedback-list-title">What was missing</h3>
                    <ul className="feedback-list">
                      {previous.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </>
                )
              }
            />
          )}
          <section className="card" aria-labelledby="design-canvas-title">
            <div className="code-header">
              <h2 id="design-canvas-title" className="code-header-title">
                Your architecture
              </h2>
              {diagram.nodes.length > 0 && (
                <button type="button" className="btn-link btn-link-inline" onClick={clear} disabled={busy !== null}>
                  Clear diagram
                </button>
              )}
            </div>
            <DesignCanvas diagram={diagram} onChange={(next) => save({ diagram: next, notes })} labelledBy="design-canvas-title" disabled={busy !== null} />
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
              <p className="helper-text">Stuck? A hint is what an interviewer would nudge you with. Hints take off half a point each, rounded up.</p>
            )}
            {challenge.hintsLeft > 0 && (
              <button type="button" className="btn btn-secondary" onClick={hint} disabled={busy !== null}>
                {busy === "hint" ? "Getting a hint…" : `Get a hint (${challenge.hintsLeft} left)`}
              </button>
            )}
          </section>

          <section className="card">
            <div className="field">
              <label htmlFor="design-notes">Explain your design</label>
              <textarea
                id="design-notes"
                className="input"
                rows={8}
                maxLength={MAX_NOTES}
                aria-describedby="design-notes-help"
                placeholder={"API: POST /urls, GET /:code…\nData model: …\nHow it scales: …\nTrade-offs: …"}
                value={notes}
                onChange={(e) => save({ diagram, notes: e.target.value })}
              />
              <p id="design-notes-help" className="helper-text">
                Cover the API, the data model, how it scales and fails, and the trade-offs you made. {notes.length}/{MAX_NOTES}
              </p>
            </div>
            <HowItsMarked guide={challenge.guide} />
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={busy !== null || (diagram.nodes.length === 0 && !notes.trim())}
            >
              {busy === "submit" ? "Marking your design…" : previous ? "Resubmit my design" : "Submit my design"}
            </button>
            {previous && (
              <button type="button" className="btn btn-secondary btn-block debug-reveal" onClick={showAnswer} disabled={busy !== null}>
                {busy === "answer" ? "Opening the model answer…" : `Keep my ${previous.score ?? 0}/10 and show me the model answer`}
              </button>
            )}
          </section>
        </>
      ) : (
        result && (
          <section ref={resultRef} tabIndex={-1} className="card debug-result" aria-labelledby="design-result-title">
            <div className="debug-result-head">
              <ScoreBadge score={result.score} />
              <div>
                <h2 id="design-result-title" className="feedback-title">
                  Your design scored {result.score}/10
                </h2>
                {challenge.hints.length > 0 && (
                  <p className="helper-text">
                    {challenge.hints.length} hint{challenge.hints.length === 1 ? "" : "s"} used
                  </p>
                )}
                <AttemptTrail history={result.history ?? []} current={result.score} />
              </div>
            </div>
            {result.parts ? (
              <ScoreParts
                guide={challenge.guide}
                points={result.parts}
                reasons={result.reasons}
                steps={result.toImprove ?? []}
                score={result.score}
                deductions={[{ label: "Hints", points: result.parts.hints }]}
              />
            ) : result.breakdown && (
              <ul className="design-breakdown">
                {(Object.keys(BREAKDOWN_LABELS) as (keyof typeof BREAKDOWN_LABELS)[]).map((k) => (
                  <li key={k}>
                    <strong>{result.breakdown![k]}/10</strong>
                    {BREAKDOWN_LABELS[k]}
                  </li>
                ))}
              </ul>
            )}
            {result.feedback && <p>{result.feedback}</p>}
            {result.strengths.length > 0 && (
              <>
                <h3 className="feedback-list-title">What went well</h3>
                <ul className="feedback-list">
                  {result.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {result.gaps.length > 0 && (
              <>
                <h3 className="feedback-list-title">What was missing</h3>
                <ul className="feedback-list">
                  {result.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </>
            )}
            {result.followUps.length > 0 && (
              <>
                <h3 className="feedback-list-title">What an interviewer would ask next</h3>
                <ul className="feedback-list">
                  {result.followUps.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="feedback-list-title">Your diagram</h3>
            <DiagramView diagram={result.diagram} label="Your submitted architecture diagram" />
            {result.notes && (
              <details>
                <summary>Your notes</summary>
                <p className="review-answer">{result.notes}</p>
              </details>
            )}
            {result.keyPoints && result.referenceDesign != null ? (
              <>
                <h3 className="feedback-list-title">What a strong answer covers</h3>
                <ul className="feedback-list">
                  {result.keyPoints.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
                <h3 className="feedback-list-title">A model answer</h3>
                <p className="scenario-text">{result.referenceDesign}</p>
              </>
            ) : (
              <ImproveActions
                attemptsLeft={result.attemptsLeft ?? 0}
                busy={busy === "improve" || busy === "answer" ? busy : null}
                answerLabel="Show me the model answer"
                onImprove={improve}
                onShowAnswer={showAnswer}
              />
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <Link to="/design" className="btn btn-primary">
              Try another
            </Link>
          </section>
        )
      )}
    </div>
  );
}
