import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { QuestionDraft, ReviewQueue, Submission, submissionsApi } from "../api/pool";
import { QuestionDraftFields } from "../components/QuestionDraftFields";
import { LEVEL_LABELS } from "../types";

function message(err: unknown) {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

const toDraft = (s: Submission): QuestionDraft => ({ text: s.text, track: s.track, topic: s.topic, level: s.level, company: s.company ?? "" });

// The admin page's "Shared by users" card: approve (with corrections) or reject each reported question. Approved ones
// join the pool as spoken questions credited to "an InterviewPal user".
export function SubmissionReview() {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    submissionsApi
      .queue()
      .then(setQueue)
      .catch((err) => setError(message(err)));
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      if (action === "approve") {
        const s = queue!.pending.find((p) => p.id === id)!;
        const draft = drafts[id] ?? toDraft(s);
        const res = await submissionsApi.approve(id, { ...draft, text: draft.text.trim(), company: draft.company.trim() });
        setQueue(res);
        setNotice(res.added ? "Approved and added to the pool." : "Approved. The pool already had this question, so it's linked to that one.");
      } else {
        setQueue(await submissionsApi.reject(id));
        setNotice("Rejected.");
      }
    } catch (err) {
      setError(message(err));
      submissionsApi.queue().then(setQueue).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" aria-labelledby="pool-submissions-title">
      <h2 id="pool-submissions-title" className="card-title">
        Shared by users{queue ? ` (${queue.pendingCount} waiting)` : ""}
      </h2>
      <p className="helper-text">Questions people say they were asked. Fix the wording, topic or level if needed, then approve or reject.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <p className="success-text" role="status">
        {notice ?? ""}
      </p>
      {!queue && !error && <p className="helper-text">Loading…</p>}
      {queue && queue.pending.length === 0 && <p className="helper-text">Nothing waiting for review.</p>}
      {queue && queue.pending.length > 0 && (
        <ol className="submission-review-list">
          {queue.pending.map((s, i) => (
            <li key={s.id} className="submission-review">
              <h3 className="feedback-list-title" id={`review-h-${s.id}`}>
                Question {i + 1}, shared {new Date(s.createdAt).toLocaleDateString()}
              </h3>
              <QuestionDraftFields
                idPrefix={`review-${s.id}`}
                draft={drafts[s.id] ?? toDraft(s)}
                topics={queue.topics}
                disabled={busy === s.id}
                onChange={(d) => setDrafts((all) => ({ ...all, [s.id]: d }))}
              />
              <div className="debug-copy-row">
                <button type="button" className="btn btn-primary" disabled={busy !== null} aria-describedby={`review-h-${s.id}`} onClick={() => act(s.id, "approve")}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-describedby={`review-h-${s.id}`} onClick={() => act(s.id, "reject")}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {queue && queue.reviewed.length > 0 && (
        <>
          <h3 className="feedback-list-title">Recently reviewed</h3>
          <ul className="feedback-list">
            {queue.reviewed.map((s) => (
              <li key={s.id}>
                {s.status === "APPROVED" ? "Approved" : "Rejected"}: "{s.text.length > 90 ? `${s.text.slice(0, 90)}…` : s.text}" ({s.topic},{" "}
                {LEVEL_LABELS[s.level]})
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
