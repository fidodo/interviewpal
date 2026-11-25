import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { debugApi } from "../api/debug";
import { useElapsed } from "../hooks/useElapsed";
import { DEBUG_LANGUAGES, DebugListFilter, DebugSummary, Difficulty, LEVEL_LABELS } from "../types";
import { LEVELS, ProgressCard, WRITING_DETAIL, errorMessage } from "./debugBits";
import { isStack, saveStack, savedStack } from "./debugDrafts";
import { Pagination } from "../components/Pagination";

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

const FILTERS: { key: DebugListFilter; label: string; empty: string; noun: string }[] = [
  { key: "open", label: "To finish", empty: "Nothing to finish. Start one above.", noun: "to finish" },
  { key: "done", label: "Done", empty: "None done yet.", noun: "done" },
];

// "12 Nov", or "12 Nov 2025" when it isn't this year.
function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// "Your challenges": To finish / Done, 10 per page, newest first. The tab and page live in the address
// (?show=done&page=2), so Back from a challenge returns to the same place. Without ?show, To finish opens, or Done
// when there's nothing to finish.
function ChallengeHistory() {
  const [params, setParams] = useSearchParams();
  const show = params.get("show");
  const chosen: DebugListFilter | null = show === "open" || show === "done" ? show : null;
  const [autoFilter, setAutoFilter] = useState<DebugListFilter>("open");
  const filter = chosen ?? autoFilter;
  const requestedPage = Math.max(1, Math.min(1000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const [items, setItems] = useState<DebugSummary[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState<Record<DebugListFilter, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses for an earlier tab or page (a superseded request) are ignored.
  const requestId = useRef(0);
  // Set when the learner changed the page or tab, so focus moves to the list heading.
  const moved = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Writes the tab and page into the address, keeping any other parameters (such as ?language=).
  function go(next: { show?: DebugListFilter; page?: number }, push = false) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.show) p.set("show", next.show);
        if (next.page !== undefined) {
          if (next.page > 1) p.set("page", String(next.page));
          else p.delete("page");
        }
        return p;
      },
      { replace: !push }
    );
  }

  useEffect(() => {
    const id = ++requestId.current;
    setError(null);
    debugApi
      .list(filter, requestedPage)
      .then((res) => {
        if (id !== requestId.current) return;
        setCounts(res.counts);
        // Nothing to finish and no tab picked yet: open on Done instead.
        if (!chosen && filter === "open" && res.counts.open === 0 && res.counts.done > 0) {
          setAutoFilter("done");
          return;
        }
        setItems(res.challenges);
        setPage(res.page);
        setPages(res.pages);
        // A page past the end comes back as the last page: correct the address to match.
        if (res.page !== requestedPage) go({ page: res.page });
        if (moved.current) {
          moved.current = false;
          headingRef.current?.focus();
        }
      })
      .catch((err) => {
        if (id === requestId.current) setError(errorMessage(err, "Couldn't load your challenges"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, requestedPage]);

  function changePage(p: number) {
    moved.current = true;
    go({ show: filter, page: p }, true);
  }

  function changeTab(f: DebugListFilter) {
    if (f === filter) return;
    moved.current = true;
    setItems(null);
    go({ show: f, page: 1 });
  }

  const tab = FILTERS.find((f) => f.key === filter)!;
  const anything = counts ? counts.open + counts.done > 0 : false;
  return (
    <section aria-labelledby="debug-history-title">
      <h2 id="debug-history-title" className="card-title debug-history-title" tabIndex={-1} ref={headingRef}>
        Your challenges
      </h2>
      {counts && anything && (
        <div className="segmented debug-history-filter" role="group" aria-label="Show challenges">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`segmented-option ${filter === f.key ? "active" : ""}`} aria-pressed={filter === f.key} onClick={() => changeTab(f.key)}>
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
      {items?.length === 0 && <p className="helper-text">{anything ? tab.empty : "None yet. Start one above."}</p>}
      {items && items.length > 0 && (
        <>
          <ul className="course-list">
            {items.map((c) => (
              <li key={c.id}>
                <Link to={`/debug/${c.id}`} className="card course-item">
                  <span className="course-item-title">{c.title}</span>
                  <span className="helper-text">
                    {DEBUG_LANGUAGES[c.language]?.label ?? c.language} · {LEVEL_LABELS[c.level]} · {shortDate(c.createdAt)} ·{" "}
                    {c.status === "SUBMITTED" ? `scored ${c.score}/10` : c.status === "REVEALED" ? "answer shown" : c.status === "GRADING" ? "being marked" : "not submitted yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="helper-text debug-history-status" role="status">
            {pages > 1 ? `Page ${page} of ${pages} · ` : ""}
            {counts?.[filter] ?? items.length} {tab.noun}
          </p>
          <Pagination page={page} pages={pages} onChange={changePage} label="Pages of your challenges" />
        </>
      )}
    </section>
  );
}
