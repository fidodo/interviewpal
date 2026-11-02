import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { termsApi } from "../api/terms";
import { MicButton } from "../components/MicButton";
import { TranscriptBox } from "../components/TranscriptBox";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { Difficulty, LEVEL_LABELS } from "../types";
import { TermCard } from "./TermCard";
import { MODE_LABELS, MyTerm, RESULT_LABELS, StarterDeck, TermAnswer, TermCardData, TermResult, TermReveal, TermsSummary } from "./types";

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function SummaryStats({ summary }: { summary: TermsSummary }) {
  return (
    <ul className="tm-stats">
      <li>
        <strong>{summary.due}</strong> due
      </li>
      <li>
        <strong>{summary.newToday}</strong> new today
      </li>
      <li>
        <strong>{summary.reviewedToday}</strong> reviewed today
      </li>
      <li>
        <strong>
          {summary.mastered}/{summary.total}
        </strong>{" "}
        mastered
      </li>
    </ul>
  );
}

// /terms: your terms, progress, and ways to add more.
export function TermsHomePage() {
  const [terms, setTerms] = useState<MyTerm[] | null>(null);
  const [summary, setSummary] = useState<TermsSummary | null>(null);
  const [decks, setDecks] = useState<StarterDeck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [newTerm, setNewTerm] = useState("");
  const [context, setContext] = useState("");
  const [search, setSearch] = useState("");
  const [deckFilter, setDeckFilter] = useState("");

  const load = useCallback(async () => {
    const [list, d] = await Promise.all([termsApi.list(), termsApi.decks()]);
    setTerms(list.terms);
    setSummary(list.summary);
    setDecks(d.decks);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err, "Couldn't load your terms")));
  }, [load]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setError(null);
    setStatus("");
    try {
      setStatus(await fn());
      await load();
    } catch (err) {
      setError(errorMessage(err, "That didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const addDeck = (deck: string) =>
    run(`deck:${deck}`, async () => {
      const { added } = await termsApi.addDeck(deck);
      return added ? `Added ${added} ${deck} term${added === 1 ? "" : "s"}.` : `You already have every ${deck} term.`;
    });

  const generate = (e: FormEvent) => {
    e.preventDefault();
    run("generate", async () => {
      const r = await termsApi.generate(topic.trim(), level);
      setTopic("");
      return `Added ${r.added} term${r.added === 1 ? "" : "s"} about ${r.deck}${r.skipped ? ` (skipped ${r.skipped} you already had)` : ""}.`;
    });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    run("add", async () => {
      const r = await termsApi.add(newTerm.trim(), context.trim() || null);
      setNewTerm("");
      setContext("");
      return `Added "${r.term.term}".`;
    });
  };

  const remove = (t: MyTerm) => {
    if (!window.confirm(`Remove "${t.term}" from your terms? Your progress on it will be lost.`)) return;
    run(`remove:${t.id}`, async () => {
      await termsApi.remove(t.id);
      return `Removed "${t.term}".`;
    });
  };

  const deckNames = useMemo(() => [...new Set((terms ?? []).map((t) => t.deck))].sort(), [terms]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (terms ?? []).filter((t) => (!deckFilter || t.deck === deckFilter) && (!q || t.term.toLowerCase().includes(q) || t.oneLiner.toLowerCase().includes(q)));
  }, [terms, search, deckFilter]);

  return (
    <div className="page">
      <p>
        <Link to="/learn">← Learn</Link>
      </p>
      <h1 className="page-title">Interview terms</h1>
      <p className="page-subtitle">
        Learn the terms interviewers expect. Each term moves from recognising it, to explaining it, to using it correctly in a spoken answer, with reviews spaced out so
        it sticks.
      </p>

      <p className="visually-hidden" aria-live="polite">
        {status}
      </p>
      {status && <p className="tm-status">{status}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <section className={`card review-callout ${summary.due + summary.newToday ? "has-due" : ""}`} aria-labelledby="tm-today-title">
          <h2 id="tm-today-title" className="card-title">
            Today
          </h2>
          <SummaryStats summary={summary} />
          {summary.total === 0 ? (
            <p className="helper-text">Add a starter deck below to begin.</p>
          ) : (
            <Link to="/terms/review" className="btn btn-primary">
              {summary.due + summary.newToday ? "Start review" : "Practise ahead"}
            </Link>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="tm-decks-title">
        <h2 id="tm-decks-title" className="card-title">
          Starter decks
        </h2>
        {!decks && !error && <p className="helper-text">Loading…</p>}
        {decks && (
          <ul className="tm-decks">
            {decks.map((d) => (
              <li key={d.deck}>
                <span>
                  <strong>{d.deck}</strong>
                  <span className="helper-text">
                    {" "}
                    · {d.terms} terms{d.added ? `, ${d.added} in your list` : ""}
                  </span>
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => addDeck(d.deck)} disabled={!!busy || d.added >= d.terms} aria-label={`Add the ${d.deck} deck`}>
                  {busy === `deck:${d.deck}` ? "Adding…" : d.added >= d.terms ? "Added" : "Add deck"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="tm-generate-title">
        <h2 id="tm-generate-title" className="card-title">
          Terms for any topic
        </h2>
        <form onSubmit={generate}>
          <div className="field">
            <label htmlFor="tm-topic">Topic</label>
            <input
              id="tm-topic"
              className="input"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. RAG, Kubernetes, React performance, product analytics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="field-label" id="tm-level-label">
              Level
            </span>
            <div className="segmented" role="group" aria-labelledby="tm-level-label">
              {LEVELS.map((l) => (
                <button key={l} type="button" className={`segmented-option ${level === l ? "active" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                  {LEVEL_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!!busy || topic.trim().length < 2}>
            {busy === "generate" ? "Writing 10 terms…" : "Get 10 terms"}
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="tm-add-title">
        <h2 id="tm-add-title" className="card-title">
          Add a term you heard
        </h2>
        <form onSubmit={add}>
          <div className="field">
            <label htmlFor="tm-new-term">Term</label>
            <input id="tm-new-term" className="input" required maxLength={60} placeholder="e.g. idempotent, backpressure, p99" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tm-context">Where you heard it (optional)</label>
            <input id="tm-context" className="input" maxLength={200} placeholder="e.g. in a system design interview about payments" value={context} onChange={(e) => setContext(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!!busy || !newTerm.trim()}>
            {busy === "add" ? "Looking it up…" : "Add term"}
          </button>
        </form>
      </section>

      <section aria-labelledby="tm-list-title">
        <h2 id="tm-list-title" className="card-title">
          Your terms{terms ? ` (${terms.length})` : ""}
        </h2>
        {terms && terms.length > 0 && (
          <div className="tm-filters">
            <div className="field">
              <label htmlFor="tm-search">Search</label>
              <input id="tm-search" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tm-deck-filter">Deck</label>
              <select id="tm-deck-filter" className="input" value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)}>
                <option value="">All decks</option>
                {deckNames.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {terms?.length === 0 && <p className="helper-text">No terms yet.</p>}
        {terms && terms.length > 0 && shown.length === 0 && <p className="helper-text">No terms match.</p>}
        <ul className="tm-list">
          {shown.map((t) => (
            <li key={t.id} className="card">
              <details>
                <summary>
                  <span className="tm-list-term">{t.term}</span>
                  <span className="helper-text">
                    {t.deck} · {t.mastered ? "Mastered" : t.isNew ? "New" : MODE_LABELS[t.mode]}
                  </span>
                </summary>
                <TermCard term={t} interviewQuestion={t.interviewQuestion} />
                <button type="button" className="btn btn-danger" onClick={() => remove(t)} disabled={!!busy}>
                  Remove
                </button>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ResultPanel({ answer, mode }: { answer: TermAnswer; mode: TermCardData["mode"] }) {
  const schedule = answer.mastered
    ? "Mastered! It won't come up again."
    : !answer.moved
      ? "Practice only: this term wasn't due, so its schedule hasn't changed."
      : answer.nextReviewDays === 1
        ? "It comes back tomorrow."
        : `Next review in ${answer.nextReviewDays} days.`;
  return (
    <div className={`tm-result tm-result-${answer.result.toLowerCase()}`}>
      <p className="tm-result-head">
        <strong>{RESULT_LABELS[answer.result]}.</strong> {schedule}
      </p>
      {answer.note && <p>{answer.note}</p>}
      {mode === "USE" && (
        <>
          {answer.termAppears === false && <p>You didn't say “{answer.reveal.term}” in your answer.</p>}
          {answer.fix && (
            <p>
              <span className="tm-label">What to change:</span> {answer.fix}
            </p>
          )}
          {answer.modelSentence && (
            <p className="tm-example">
              <span className="tm-label">You could say:</span> “{answer.modelSentence}”
            </p>
          )}
        </>
      )}
      <TermCard term={answer.reveal} headingLevel={3} />
    </div>
  );
}

// /terms/review: one card at a time. What you're asked depends on the term's box.
export function TermReviewPage() {
  const speech = useSpeechRecognition();
  const [card, setCard] = useState<TermCardData | null>(null);
  const [summary, setSummary] = useState<TermsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [ahead, setAhead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<TermReveal | null>(null);
  const [answer, setAnswer] = useState<TermAnswer | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const loadNext = useCallback(
    async (practiseAhead: boolean) => {
      setLoading(true);
      setError(null);
      setChoice(null);
      setRevealed(null);
      setAnswer(null);
      speech.stop();
      speech.resetTranscript();
      try {
        const res = await termsApi.next(practiseAhead);
        setCard(res.card);
        setSummary(res.summary);
        requestAnimationFrame(() => headingRef.current?.focus());
      } catch (err) {
        setError(errorMessage(err, "Couldn't load the next card."));
      } finally {
        setLoading(false);
      }
    },
    // speech's methods are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    loadNext(false);
  }, [loadNext]);

  async function submit(fn: () => Promise<TermAnswer>) {
    setBusy(true);
    setError(null);
    speech.stop();
    try {
      setAnswer(await fn());
      requestAnimationFrame(() => nextRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't check that answer. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function showAnswer() {
    if (!card) return;
    setBusy(true);
    setError(null);
    speech.stop();
    try {
      setRevealed((await termsApi.reveal(card.termId)).reveal);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the answer."));
    } finally {
      setBusy(false);
    }
  }

  // Number keys pick a Recognise option.
  function onOptionsKey(e: KeyboardEvent) {
    if (!card?.options || answer) return;
    const n = Number(e.key);
    if (n >= 1 && n <= card.options.length) {
      e.preventDefault();
      setChoice(card.options[n - 1]);
    }
  }

  if (loading && !card)
    return (
      <div className="page">
        <p className="helper-text">Loading…</p>
      </div>
    );

  if (!card)
    return (
      <div className="page">
        <p>
          <Link to="/terms">← Your terms</Link>
        </p>
        <h1 className="page-title" ref={headingRef} tabIndex={-1}>
          {summary?.total === 0 ? "No terms yet" : "All done for today"}
        </h1>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {summary && summary.total > 0 && <SummaryStats summary={summary} />}
        {summary?.total === 0 ? (
          <Link to="/terms" className="btn btn-primary">
            Pick your terms
          </Link>
        ) : (
          <div className="tm-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAhead(true);
                loadNext(true);
              }}
            >
              Practise ahead
            </button>
            <Link to="/terms" className="btn btn-secondary">
              Your terms
            </Link>
          </div>
        )}
        {ahead && <p className="helper-text">Nothing to practise ahead yet.</p>}
      </div>
    );

  const text = speech.transcript;

  return (
    <div className="page">
      <p>
        <Link to="/terms">← Your terms</Link>
      </p>
      {summary && (
        <p className="helper-text">
          {summary.due} due · {summary.newToday} new left today{card.practisingAhead ? " · practising ahead" : ""}
        </p>
      )}
      <section className="card tm-review" aria-labelledby="tm-card-title" onKeyDown={onOptionsKey}>
        <p className="tm-mode">
          {MODE_LABELS[card.mode]}
          {card.isNew ? " · new term" : ""} · {card.deck}
        </p>
        <h1 id="tm-card-title" className="page-title" ref={headingRef} tabIndex={-1}>
          {card.mode === "RECOGNISE" ? `What does “${card.term}” mean?` : card.mode === "RECALL" ? `Explain “${card.term}”` : `Use “${card.term}” in your answer`}
        </h1>

        {card.mode === "RECOGNISE" && card.options && (
          <fieldset className="tm-options">
            <legend className="helper-text">Pick one (or press 1 to {card.options.length}).</legend>
            {card.options.map((o, i) => {
              const state = answer ? (o === answer.reveal.oneLiner ? "correct" : o === choice ? "wrong" : "") : "";
              return (
                <label key={o} className={`tm-option ${choice === o ? "chosen" : ""} ${state}`}>
                  <input type="radio" name="tm-option" value={o} checked={choice === o} onChange={() => setChoice(o)} disabled={!!answer || busy} />
                  <span>
                    <span className="tm-option-num">{i + 1}.</span> {o}
                    {state === "correct" && <span className="visually-hidden"> (correct answer)</span>}
                    {state === "wrong" && <span className="visually-hidden"> (your answer)</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {card.mode === "RECALL" && (
          <>
            <p className="helper-text">
              {card.withExample ? "In a sentence or two, say what it means and give an example." : "In a sentence or two, say what it means, as you would to an interviewer."}{" "}
              Speak or type; then compare with the model answer.
            </p>
            <MicButton isListening={speech.isListening} isSupported={speech.isSupported} onStart={speech.start} onStop={speech.stop} disabled={busy || !!answer} />
            <TranscriptBox value={text} onChange={speech.setTranscript} disabled={busy || !!answer} />
          </>
        )}

        {card.mode === "USE" && card.interviewQuestion && (
          <>
            <p className="tm-question">
              <span className="tm-label">Interview question:</span> {card.interviewQuestion}
            </p>
            <p className="helper-text">Answer in 30 to 60 seconds, using “{card.term}” correctly where it fits.</p>
            <MicButton isListening={speech.isListening} isSupported={speech.isSupported} onStart={speech.start} onStop={speech.stop} disabled={busy || !!answer} />
            <TranscriptBox value={text} onChange={speech.setTranscript} disabled={busy || !!answer} />
          </>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {!answer && (
          <div className="tm-actions">
            {card.mode === "RECOGNISE" && (
              <button type="button" className="btn btn-primary" disabled={!choice || busy} onClick={() => submit(() => termsApi.recognise(card.termId, choice!))}>
                {busy ? "Checking…" : "Check"}
              </button>
            )}
            {card.mode === "RECALL" && !revealed && (
              <>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={showAnswer}>
                  Show the answer
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy || text.trim().length < 3} onClick={() => submit(() => termsApi.markRecall(card.termId, text.trim()))}>
                  {busy ? "Marking…" : "Mark me with AI"}
                </button>
              </>
            )}
            {card.mode === "USE" && (
              <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 3} onClick={() => submit(() => termsApi.use(card.termId, text.trim()))}>
                {busy ? "Marking your answer…" : "Get feedback"}
              </button>
            )}
          </div>
        )}

        {card.mode === "RECALL" && revealed && !answer && (
          <div className="tm-reveal">
            <TermCard term={revealed} headingLevel={2} />
            <fieldset className="tm-rate">
              <legend className="field-label">How did you do?</legend>
              {(["RIGHT", "PARTLY", "WRONG"] as TermResult[]).map((r) => (
                <button key={r} type="button" className={`btn ${r === "RIGHT" ? "btn-primary" : "btn-secondary"}`} disabled={busy} onClick={() => submit(() => termsApi.rateRecall(card.termId, r))}>
                  {r === "RIGHT" ? "Got it" : r === "PARTLY" ? "Partly" : "Missed it"}
                </button>
              ))}
            </fieldset>
          </div>
        )}

        <div aria-live="polite">{answer && <ResultPanel answer={answer} mode={card.mode} />}</div>

        {answer && (
          <div className="tm-actions">
            <button type="button" ref={nextRef} className="btn btn-primary" onClick={() => loadNext(card.practisingAhead)}>
              Next card
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
