import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { debugApi } from "../api/debug";
import { useElapsed } from "../hooks/useElapsed";
import { DEBUG_LANGUAGES, DebugListFilter, DebugSummary, Difficulty, LEVEL_LABELS } from "../types";
import { LEVELS, ProgressCard, WRITING_DETAIL, errorMessage } from "./debugBits";
import { isStack, saveStack, savedStack } from "./debugDrafts";

// /debug: pick a stack and level, plus your past challenges.
export function DebugPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [language, setLanguage] = useState(() => {
    const fromLink = params.get("language");
    return isStack(fromLink) ? fromLink : savedStack();
  });
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = useElapsed(creating);

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

      <ChallengeHistory />
    </div>
  );
}

const FILTERS: { key: DebugListFilter; label: string; empty: string }[] = [
  { key: "all", label: "All", empty: "None yet." },
  { key: "open", label: "To finish", empty: "Nothing to finish. Start one above." },
  { key: "done", label: "Done", empty: "None done yet." },
];

// "12 Nov", or "12 Nov 2025" when it isn't this year.
function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// "Your challenges": 10 at a time, newest first, with a To finish / Done filter. "Show more" adds the next 10 below
// and moves focus to the first new one.
function ChallengeHistory() {
  const [filter, setFilter] = useState<DebugListFilter>("all");
  const [items, setItems] = useState<DebugSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<Record<DebugListFilter, number> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Responses for an earlier filter (or a superseded request) are ignored.
  const requestId = useRef(0);
  const focusId = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  async function load(f: DebugListFilter, before?: string) {
    const id = ++requestId.current;
    setError(null);
    try {
      const res = await debugApi.list(f, before);
      if (id !== requestId.current) return;
      setCounts(res.counts);
      setHasMore(res.hasMore);
      setItems((prev) => {
        if (!before || !prev) return res.challenges;
        const seen = new Set(prev.map((c) => c.id));
        const fresh = res.challenges.filter((c) => !seen.has(c.id));
        focusId.current = fresh[0]?.id ?? null;
        return [...prev, ...fresh];
      });
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err, "Couldn't load your challenges"));
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }

  useEffect(() => {
    setItems(null);
    setLoadingMore(false);
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // After "Show more", focus the first newly loaded challenge.
  useEffect(() => {
    if (!focusId.current) return;
    listRef.current?.querySelector<HTMLAnchorElement>(`a[data-id="${focusId.current}"]`)?.focus();
    focusId.current = null;
  }, [items]);

  const total = counts?.[filter] ?? 0;
  const empty = FILTERS.find((f) => f.key === filter)!.empty;
  return (
    <section aria-labelledby="debug-history-title">
      <h2 id="debug-history-title" className="card-title">
        Your challenges
      </h2>
      {counts && counts.all > 0 && (
        <div className="segmented debug-history-filter" role="group" aria-label="Show challenges">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`segmented-option ${filter === f.key ? "active" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!items && !error && <p className="helper-text">Loading…</p>}
      {items?.length === 0 && <p className="helper-text">{empty}</p>}
      {items && items.length > 0 && (
        <>
          <ul className="course-list" ref={listRef}>
            {items.map((c) => (
              <li key={c.id}>
                <Link to={`/debug/${c.id}`} className="card course-item" data-id={c.id}>
                  <span className="course-item-title">{c.title}</span>
                  <span className="helper-text">
                    {DEBUG_LANGUAGES[c.language]?.label ?? c.language} · {LEVEL_LABELS[c.level]} · {shortDate(c.createdAt)} ·{" "}
                    {c.status === "SUBMITTED" ? `scored ${c.score}/10` : c.status === "REVEALED" ? "answer shown" : c.status === "GRADING" ? "being marked" : "not submitted yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="debug-history-more">
            <p className="helper-text" role="status">
              Showing {items.length} of {Math.max(total, items.length)}
            </p>
            {hasMore && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true);
                  void load(filter, items[items.length - 1].id);
                }}
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
