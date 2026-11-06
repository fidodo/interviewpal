import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { storyBankApi } from "../api/storyBank";
import { BankEntry, BankSuggestion, Competency, CoverageItem, Fit, FitVerdict } from "./types";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const VERDICTS: Record<FitVerdict, { label: string; className: string }> = {
  STRONG: { label: "Strong fit", className: "badge-success" },
  PARTIAL: { label: "Could work", className: "badge-warning" },
  WEAK: { label: "A stretch", className: "badge-warning" },
  NONE: { label: "No story picked", className: "" },
};

function speakLink(topic: string) {
  return `/speak?kind=EXPERIENCE&topic=${encodeURIComponent(topic)}`;
}

// Title, summary and competencies, with an optional "suggest" step (one AI call) that fills them in.
function BankEntryForm({
  competencies,
  initial,
  storyId,
  withText,
  submitLabel,
  onSaved,
  onCancel,
}: {
  competencies: Competency[];
  initial?: BankSuggestion & { id?: string };
  storyId?: string;
  withText?: boolean;
  submitLabel: string;
  onSaved: (entry: BankEntry) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [busy, setBusy] = useState<"suggesting" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const idBase = initial?.id ?? storyId ?? "new";

  async function suggest() {
    setBusy("suggesting");
    setError(null);
    try {
      const { suggestion } = await storyBankApi.suggest(storyId ? { storyId } : { text: text.trim() });
      setTitle(suggestion.title);
      setSummary(suggestion.summary);
      setTags(suggestion.tags);
      setStatus("Filled in a title, summary and competencies. Check them, then save.");
    } catch (err) {
      setError(errorMessage(err, "Couldn't suggest anything. Fill it in yourself, or try again."));
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("saving");
    setError(null);
    try {
      const body = { title: title.trim(), summary: summary.trim(), tags };
      const { entry } = initial?.id ? await storyBankApi.update(initial.id, body) : await storyBankApi.create({ ...body, ...(storyId ? { storyId } : {}) });
      onSaved(entry);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the story. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const toggle = (key: string, on: boolean) => setTags((t) => (on ? [...t, key] : t.filter((x) => x !== key)));

  return (
    <form className="bank-form" onSubmit={save}>
      {withText && (
        <div className="field">
          <label htmlFor={`${idBase}-text`}>What happened? (a few sentences is enough)</label>
          <textarea id={`${idBase}-text`} className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={6000} />
        </div>
      )}
      {(withText || storyId) && (
        <button type="button" className="btn btn-secondary" onClick={suggest} disabled={busy !== null || (withText && text.trim().length < 40)}>
          {busy === "suggesting" ? "Suggesting…" : "Suggest a title, summary and competencies"}
        </button>
      )}
      <p className="visually-hidden" role="status">
        {status}
      </p>
      <div className="field">
        <label htmlFor={`${idBase}-title`}>Title</label>
        <input id={`${idBase}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Payments rewrite pushback" />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-summary`}>Summary (situation, task, action, result)</label>
        <textarea id={`${idBase}-summary`} className="input" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={600} />
      </div>
      <fieldset className="bank-tags">
        <legend>Competencies it shows (up to 3)</legend>
        {competencies.map((c) => (
          <label key={c.key} className="checkbox-row">
            <input type="checkbox" checked={tags.includes(c.key)} disabled={!tags.includes(c.key) && tags.length >= 3} onChange={(e) => toggle(c.key, e.target.checked)} />
            <span>
              {c.label} <span className="helper-text">· {c.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="btn-full-row">
        <button type="submit" className="btn btn-primary" disabled={busy !== null || title.trim().length < 3 || summary.trim().length < 20 || tags.length === 0}>
          {busy === "saving" ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function useBank() {
  const [entries, setEntries] = useState<BankEntry[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [max, setMax] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    storyBankApi
      .list()
      .then((res) => {
        setEntries(res.entries);
        setCoverage(res.coverage);
        setMax(res.max);
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load your story bank.")));
  useEffect(() => {
    reload();
  }, []);
  return { entries, coverage, max, error, reload };
}

// /speak/bank: the stories, which competencies they cover, and adding or editing one.
export function StoryBankPage() {
  const { entries, coverage, max, error, reload } = useBank();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const competencies: Competency[] = coverage;
  const labels = Object.fromEntries(coverage.map((c) => [c.key, c.label]));

  async function remove(entry: BankEntry) {
    if (!window.confirm(`Remove "${entry.title}" from your story bank? The Speak story itself is kept.`)) return;
    try {
      await storyBankApi.remove(entry.id);
      setStatus(`Removed "${entry.title}".`);
      reload();
    } catch (err) {
      setStatus(errorMessage(err, "Couldn't remove it. Try again."));
    }
  }

  const gaps = coverage.filter((c) => c.count === 0);

  return (
    <div className="page">
      <p>
        <Link to="/speak">← Speak</Link>
      </p>
      <h1 className="page-title">Story bank</h1>
      <p className="page-subtitle">
        Keep your best stories here, tagged by what they show. Most behavioural questions can be answered with 6–10 well-practised stories: pick the right one, frame it for the
        question, and tell it well.
      </p>
      <p className="visually-hidden" role="status">
        {status}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-labelledby="bank-coverage-title">
        <h2 id="bank-coverage-title" className="card-title">
          Coverage
        </h2>
        {entries && (
          <p className="helper-text">
            {gaps.length === 0 ? "Every competency has at least one story. Nice." : `${gaps.length} of ${coverage.length} competencies have no story yet.`}
          </p>
        )}
        <ul className="bank-coverage">
          {coverage.map((c) => (
            <li key={c.key} className={c.count ? "covered" : "gap"}>
              <span className="bank-coverage-name">{c.label}</span>
              {c.count ? (
                <span className="helper-text">
                  {c.count} {c.count === 1 ? "story" : "stories"}
                </span>
              ) : (
                <Link to={speakLink(`A time you showed ${c.label.toLowerCase()}: ${c.description.toLowerCase()}`)}>
                  No story yet. Practise one<span className="visually-hidden"> for {c.label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="btn-full-row bank-actions">
        {entries && entries.length > 0 ? (
          <Link className="btn btn-primary" to="/speak/bank/drill">
            Which story fits? Practise picking
          </Link>
        ) : (
          <p className="helper-text">Add a story or two, then practise picking the right one for a question.</p>
        )}
        {!adding && entries && entries.length < max && (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            Add a story by typing it
          </button>
        )}
      </div>

      {adding && (
        <section className="card" aria-labelledby="bank-add-title">
          <h2 id="bank-add-title" className="card-title">
            Add a story
          </h2>
          <p className="helper-text">Tip: stories you tell in Speak can be saved straight from their feedback, with your best score kept.</p>
          <BankEntryForm
            competencies={competencies}
            withText
            submitLabel="Save to my story bank"
            onSaved={(entry) => {
              setAdding(false);
              setStatus(`Saved "${entry.title}".`);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      <section aria-labelledby="bank-list-title">
        <h2 id="bank-list-title" className="card-title">
          Your stories {entries ? `(${entries.length} of ${max})` : ""}
        </h2>
        {entries === null && !error && (
          <p className="helper-text" role="status">
            Loading…
          </p>
        )}
        {entries?.length === 0 && (
          <p className="helper-text">
            No stories yet. Tell one in <Link to={speakLink("a time you were proud of your work")}>Speak</Link>, then save it here from its feedback.
          </p>
        )}
        {entries?.map((e) => (
          <article key={e.id} className="card bank-entry" aria-labelledby={`bank-${e.id}-title`}>
            {editing === e.id ? (
              <BankEntryForm
                competencies={competencies}
                initial={{ id: e.id, title: e.title, summary: e.summary, tags: e.tags }}
                submitLabel="Save changes"
                onSaved={() => {
                  setEditing(null);
                  setStatus("Saved your changes.");
                  reload();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <h3 id={`bank-${e.id}-title`} className="bank-entry-title">
                  {e.title}
                </h3>
                <div className="history-tags">
                  {e.tags.map((t) => (
                    <span key={t} className="badge badge-primary">
                      {labels[t] ?? t}
                    </span>
                  ))}
                  {e.bestScore != null && <span className="badge">Best take {e.bestScore}/10</span>}
                  {e.timesUsed > 0 && <span className="badge">Used in {e.timesUsed} mock {e.timesUsed === 1 ? "interview" : "interviews"}</span>}
                </div>
                <p className="bank-entry-summary">{e.summary}</p>
                <div className="bank-entry-actions">
                  {e.storyId && (
                    <Link className="btn-link btn-link-inline" to={`/speak/${e.storyId}`}>
                      Practise it in Speak<span className="visually-hidden">: {e.title}</span>
                    </Link>
                  )}
                  <button type="button" className="btn-link btn-link-inline" onClick={() => setEditing(e.id)}>
                    Edit<span className="visually-hidden"> {e.title}</span>
                  </button>
                  <button type="button" className="btn-link btn-link-inline" onClick={() => remove(e)}>
                    Remove<span className="visually-hidden"> {e.title}</span>
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

// /speak/bank/drill: a behavioural question; pick the story you'd tell, and the AI says how well it fits.
export function StoryDrillPage() {
  const { entries, coverage, error: loadError } = useBank();
  const [competency, setCompetency] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const [fit, setFit] = useState<Fit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  async function next(c = competency) {
    setFit(null);
    setChoice(undefined);
    setError(null);
    try {
      setQuestion((await storyBankApi.drill(c || undefined)).question);
    } catch (err) {
      setError(errorMessage(err, "Couldn't get a question. Try again."));
    }
  }

  useEffect(() => {
    next("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (fit) resultRef.current?.focus();
  }, [fit]);

  async function check(e: FormEvent) {
    e.preventDefault();
    if (!question || choice === undefined) return;
    setBusy(true);
    setError(null);
    try {
      setFit((await storyBankApi.judge(question, choice)).fit);
    } catch (err) {
      setError(errorMessage(err, "Couldn't check your pick. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p>
        <Link to="/speak/bank">← Story bank</Link>
      </p>
      <h1 className="page-title">Which story fits?</h1>
      <p className="page-subtitle">Read the question, pick the story you'd tell, and see how well it fits and how to frame it.</p>
      {(loadError || error) && (
        <p className="error-text" role="alert">
          {loadError ?? error}
        </p>
      )}

      <div className="field bank-drill-filter">
        <label htmlFor="drill-competency">Questions about</label>
        <select
          id="drill-competency"
          className="input"
          value={competency}
          onChange={(e) => {
            setCompetency(e.target.value);
            next(e.target.value);
          }}
        >
          <option value="">Any competency</option>
          {coverage.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {question && (
        <section className="card question-card" aria-labelledby="drill-q-title">
          <h2 id="drill-q-title" className="question-label">
            The question
          </h2>
          <p className="question-text">{question}</p>
        </section>
      )}

      {question && entries && (
        <form className="card" onSubmit={check}>
          <fieldset className="tm-options">
            <legend className="card-title">Which story would you tell?</legend>
            {entries.map((e) => (
              <label key={e.id} className={`tm-option ${choice === e.id ? "chosen" : ""}`}>
                <input type="radio" name="drill-story" checked={choice === e.id} onChange={() => setChoice(e.id)} disabled={busy || !!fit} />
                <span>
                  <strong>{e.title}</strong>
                  <span className="helper-text"> · {e.summary.slice(0, 120)}{e.summary.length > 120 ? "…" : ""}</span>
                </span>
              </label>
            ))}
            <label className={`tm-option ${choice === null ? "chosen" : ""}`}>
              <input type="radio" name="drill-story" checked={choice === null} onChange={() => setChoice(null)} disabled={busy || !!fit} />
              <span>None of my stories fits</span>
            </label>
          </fieldset>
          {!fit && (
            <button type="submit" className="btn btn-primary btn-block" disabled={choice === undefined || busy}>
              {busy ? "Checking…" : "Check my pick"}
            </button>
          )}
        </form>
      )}

      {fit && question && (
        <section className="card" aria-labelledby="drill-result-title">
          <h2 id="drill-result-title" className="card-title" tabIndex={-1} ref={resultRef}>
            <span className={`badge ${VERDICTS[fit.verdict].className}`}>{VERDICTS[fit.verdict].label}</span>
          </h2>
          <p>{fit.reason}</p>
          {fit.angle && (
            <>
              <h3 className="feedback-list-title">How to frame it</h3>
              <p>{fit.angle}</p>
            </>
          )}
          {fit.betterTitle && (
            <p>
              <strong>A better pick:</strong> {fit.betterTitle}
            </p>
          )}
          {fit.missing && (
            <p>
              <strong>Worth adding to your bank:</strong> {fit.missing}
            </p>
          )}
          <div className="btn-full-row">
            <Link className="btn btn-primary" to={speakLink(question)}>
              Tell it now in Speak
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => next()}>
              Next question
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// On a Speak story's page: save it to the bank (the AI suggests the details from the best take).
export function SaveToBank({ storyId, bankEntryId, onSaved }: { storyId: string; bankEntryId: string | null; onSaved: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [competencies, setCompetencies] = useState<Competency[] | null>(null);

  useEffect(() => {
    if (!open || competencies) return;
    storyBankApi
      .list()
      .then((res) => setCompetencies(res.coverage))
      .catch(() => setCompetencies([]));
  }, [open, competencies]);

  if (bankEntryId) {
    return (
      <p className="helper-text">
        This story is in your <Link to="/speak/bank">story bank</Link>.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Save to my story bank
      </button>
    );
  }
  return (
    <section className="card bank-save" aria-labelledby="bank-save-title">
      <h3 id="bank-save-title" className="card-title">
        Save to my story bank
      </h3>
      <p className="helper-text">Suggest the details from your best take, or fill them in yourself.</p>
      {competencies ? (
        <BankEntryForm competencies={competencies} storyId={storyId} submitLabel="Save to my story bank" onSaved={(entry) => onSaved(entry.id)} onCancel={() => setOpen(false)} />
      ) : (
        <p className="helper-text" role="status">
          Loading…
        </p>
      )}
    </section>
  );
}
