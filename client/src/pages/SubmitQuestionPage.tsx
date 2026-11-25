import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { PresetTopic, QuestionDraft, Submission, submissionsApi } from "../api/pool";
import { QuestionDraftFields } from "../components/QuestionDraftFields";
import { LEVEL_LABELS } from "../types";

const STATUS_LABEL: Record<Submission["status"], string> = { PENDING: "Waiting for review", APPROVED: "Added to the questions", REJECTED: "Not added" };

function blank(topics: PresetTopic[]): QuestionDraft {
  return { text: "", track: topics[0]?.track ?? "", topic: topics[0]?.name ?? "", level: "INTERMEDIATE", company: "" };
}

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

// /questions/submit: report a question you were asked in a real interview. It's reviewed before anyone else sees it.
export function SubmitQuestionPage() {
  const [topics, setTopics] = useState<PresetTopic[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [maxPending, setMaxPending] = useState(5);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await submissionsApi.mine();
    setTopics(res.topics);
    setSubmissions(res.submissions);
    setMaxPending(res.maxPending);
    setDraft((d) => d ?? blank(res.topics));
  }

  useEffect(() => {
    load().catch((err) => setError(message(err, "Couldn't load this page. Try again.")));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !topics) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await submissionsApi.send({ ...draft, text: draft.text.trim(), company: draft.company.trim() });
      setDraft({ ...blank(topics), track: draft.track, topic: draft.topic, level: draft.level });
      await load();
      setNotice("Thanks! Your question is waiting for review.");
    } catch (err) {
      setError(message(err, "Couldn't send your question. Try again."));
    } finally {
      setSending(false);
    }
  }

  async function handleWithdraw(id: string) {
    setError(null);
    setNotice(null);
    try {
      await submissionsApi.withdraw(id);
      await load();
      setNotice("Question withdrawn.");
    } catch (err) {
      setError(message(err, "Couldn't withdraw it. Try again."));
    }
  }

  const pending = submissions.filter((s) => s.status === "PENDING").length;
  return (
    <div className="page">
      <h1 className="page-title">Share a question you were asked</h1>
      <p className="page-subtitle">
        Asked something in a real interview? Share it, and once it's reviewed other people can practise it too. Write the question only, not your
        answer, and leave out anything personal or confidential.
      </p>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-text" role="status">
          {notice}
        </p>
      )}

      {!topics || !draft ? (
        !error && <p className="helper-text">Loading…</p>
      ) : (
        <form className="card" onSubmit={handleSubmit} aria-labelledby="submit-q-title">
          <h2 id="submit-q-title" className="card-title">
            Your question
          </h2>
          <QuestionDraftFields idPrefix="submit-q" draft={draft} topics={topics} disabled={sending} onChange={setDraft} />
          {pending >= maxPending ? (
            <p className="helper-text">You have {maxPending} questions waiting for review. You can send more once some are reviewed.</p>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={sending || draft.text.trim().length < 10}>
              {sending ? "Sending…" : "Send for review"}
            </button>
          )}
        </form>
      )}

      {submissions.length > 0 && (
        <section className="card" aria-labelledby="my-submissions-title">
          <h2 id="my-submissions-title" className="card-title">
            Your shared questions
          </h2>
          <ul className="submission-list">
            {submissions.map((s) => (
              <li key={s.id}>
                <p className="submission-text">{s.text}</p>
                <p className="helper-text">
                  {s.track} · {s.topic} · {LEVEL_LABELS[s.level]}
                  {s.company ? ` · ${s.company}` : ""} · <strong>{STATUS_LABEL[s.status]}</strong>
                </p>
                {s.status === "PENDING" && (
                  <button type="button" className="btn-link btn-link-inline" onClick={() => handleWithdraw(s.id)}>
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p>
        <Link to="/">Back to your dashboard</Link>
      </p>
    </div>
  );
}
