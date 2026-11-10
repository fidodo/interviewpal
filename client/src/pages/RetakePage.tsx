import { Suspense, useEffect, useRef, useState } from "react";
import { lazyWithReload } from "../lazyWithReload";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Feedback, FillerStats, MAX_RETAKES, QuestionWithAnswer, Retake, ROUND_LABELS, SessionDetail } from "../types";
import { RunLanguage } from "../code/protocol";
import { runTests } from "../code/runTests";
import { saveLanguage, savedLanguage } from "../code/savedLanguage";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { MicButton } from "../components/MicButton";
import { MicTestButton } from "../components/MicTestButton";
import { TranscriptBox } from "../components/TranscriptBox";
import { CodeAnswerBox } from "../components/CodeAnswerBox";
import { FeedbackCard } from "../components/FeedbackCard";
import { ScoreBadge } from "../components/ScoreBadge";
import { RecordToggle, RecordingPlayer, keepRecordings } from "../components/Recording";
import { useRecorder } from "../hooks/useRecorder";
import { saveRecording } from "../audio/recordings";

const CodeRunner = lazyWithReload(() => import("../code/CodeRunner").then((m) => ({ default: m.CodeRunner })));

interface Attempt {
  label: string;
  score: number;
}

function attemptsOf(answer: NonNullable<QuestionWithAnswer["answer"]>): Attempt[] {
  const first: Attempt[] = answer.feedback ? [{ label: "First answer", score: answer.feedback.score }] : [];
  return [...first, ...answer.retakes.map((r) => ({ label: `Retake ${r.number}`, score: r.feedback.score }))];
}

function changeText(before: number, after: number) {
  if (after > before) return `up ${after - before}`;
  if (after < before) return `down ${before - after}`;
  return "the same";
}

// Answer an interview question again and see what changed. Practice only: the original answer and the session's
// report stay as they were.
export function RetakePage() {
  const { id, questionId } = useParams<{ id: string; questionId: string }>();
  const speech = useSpeechRecognition();
  const [keepAudio, setKeepAudio] = useState(keepRecordings);
  const recorder = useRecorder(speech.isListening, keepAudio);
  const pendingAudio = useRef<Blob | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [question, setQuestion] = useState<QuestionWithAnswer | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<RunLanguage>(savedLanguage);
  const [latest, setLatest] = useState<{ retake: Retake; before: number } | null>(null);
  const [busy, setBusy] = useState<"loading" | "submitting" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ session: SessionDetail }>(`/sessions/${id}`)
      .then((res) => {
        setSession(res.session);
        const q = res.session.questions.find((x) => x.id === questionId) ?? null;
        setQuestion(q);
        if (q?.type === "CODING" && q.answer) setCode(q.answer.transcript);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this question."))
      .finally(() => setBusy(null));
  }, [id, questionId]);

  useEffect(() => {
    if (latest) resultRef.current?.focus();
  }, [latest]);

  if (busy === "loading") {
    return (
      <div className="page">
        <p className="helper-text" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const backTo = session?.status === "COMPLETED" ? `/sessions/${id}/summary` : `/sessions/${id}`;
  const backLabel = session?.status === "COMPLETED" ? "Back to the report" : "Back to the interview";
  const answer = question?.answer;

  if (!session || !question || !answer?.feedback) {
    return (
      <div className="page">
        <p className="error-text" role="alert">
          {error ?? (session?.mode === "MOCK" && session.status !== "COMPLETED" ? "Retakes open when the mock interview has finished." : "This question hasn't been answered and marked yet.")}
        </p>
        <Link className="btn btn-secondary" to={session ? backTo : "/history"}>
          {session ? backLabel : "View history"}
        </Link>
      </div>
    );
  }

  const isCoding = question.type === "CODING";
  const attempts = attemptsOf(answer);
  const previous = attempts[attempts.length - 1];
  const left = MAX_RETAKES - answer.retakes.length;
  const text = (isCoding ? code : speech.transcript).trim();
  const answering = !latest && left > 0;

  async function submit() {
    if (!questionId || !text || !previous) return;
    speech.stop();
    setBusy("submitting");
    setError(null);
    try {
      const run = isCoding && question!.codeSpec ? await runTests(language, text, question!.codeSpec).catch(() => null) : null;
      const testResults = run && run.total > 0 && language !== "typescript" ? { language, passed: run.passed, total: run.total } : null;
      if (!isCoding) pendingAudio.current = (await recorder.finish()) ?? pendingAudio.current;
      const res = await api.post<{ retake: Retake }>(`/questions/${questionId}/retake`, { transcript: text, testResults });
      if (pendingAudio.current) await saveRecording(`retake:${questionId}:${res.retake.number}`, pendingAudio.current);
      pendingAudio.current = null;
      setLatest({ retake: res.retake, before: previous.score });
      setQuestion((q) => (q && q.answer ? { ...q, answer: { ...q.answer, retakes: [...q.answer.retakes, res.retake] } } : q));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark your retake. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function again() {
    setLatest(null);
    recorder.reset();
    pendingAudio.current = null;
    speech.resetTranscript();
    if (isCoding) setCode(latest?.retake.transcript ?? code);
  }

  return (
    <div className="page">
      <h1 className="page-title">Retake question {question.order}</h1>
      <p className="helper-text">Answer it again and see what improved. Your original answer and the session report stay as they were.</p>

      <div className="card question-card">
        <h2 className="question-label">
          Question {question.order}
          {question.round && <span className="badge badge-primary" style={{ marginLeft: 8 }}>{ROUND_LABELS[question.round]}</span>}
          {question.followUpOf && <span className="badge" style={{ marginLeft: 8 }}>Follow-up</span>}
        </h2>
        <p className="question-text">{question.text}</p>
      </div>

      <section className="card" aria-labelledby="attempts-title">
        <h2 id="attempts-title" className="card-title">
          Your attempts
        </h2>
        <ol className="retake-attempts">
          {attempts.map((a) => (
            <li key={a.label}>
              <span>{a.label}</span>
              <span className="retake-score">{a.score}/10</span>
            </li>
          ))}
        </ol>
        <details className="retake-previous">
          <summary>What you said last time, and its feedback</summary>
          <p className="review-answer">{answer.retakes.length ? answer.retakes[answer.retakes.length - 1].transcript : answer.transcript}</p>
          <FeedbackCard feedback={answer.retakes.length ? answer.retakes[answer.retakes.length - 1].feedback : (answer.feedback as Feedback)} />
        </details>
      </section>

      {latest && (
        <>
          <div className="card retake-result" role="status">
            <ScoreBadge score={latest.retake.feedback.score} />
            <div>
              <h2 className="feedback-title" tabIndex={-1} ref={resultRef}>
                {latest.before} → {latest.retake.feedback.score}
              </h2>
              <p className="helper-text">
                Your score went {changeText(latest.before, latest.retake.feedback.score)} on this retake.
                {latest.retake.feedback.score > latest.before && " Nice work."}
              </p>
            </div>
          </div>
          <RecordingPlayer recordingKey={`retake:${questionId}:${latest.retake.number}`} />
          <FeedbackCard feedback={latest.retake.feedback} fillerStats={latest.retake.fillerStats as FillerStats | null} />
        </>
      )}

      {answering && (
        <div className="card">
          {isCoding && question.codeSpec ? (
            <>
              <div className="code-header">
                <h3 id="retake-code-label" className="code-header-title">
                  Your solution
                </h3>
                <label className="code-language">
                  <span>Language</span>
                  <select
                    className="input"
                    value={language}
                    disabled={busy === "submitting"}
                    onChange={(e) => {
                      const next = e.target.value as RunLanguage;
                      setLanguage(next);
                      saveLanguage(next);
                    }}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                </label>
              </div>
              <Suspense fallback={<p className="helper-text">Loading the code editor…</p>}>
                <CodeRunner
                  language={language}
                  spec={question.codeSpec}
                  initialCode={code}
                  editorKey={`${question.id}:${language}:${answer.retakes.length}`}
                  labelledBy="retake-code-label"
                  disabled={busy === "submitting"}
                  onCodeChange={setCode}
                />
              </Suspense>
            </>
          ) : isCoding ? (
            <CodeAnswerBox value={code} onChange={setCode} disabled={busy === "submitting"} />
          ) : (
            <>
              <MicButton isListening={speech.isListening} isSupported={speech.isSupported} onStart={speech.start} onStop={speech.stop} disabled={busy === "submitting"} />
              {speech.error && (
                <p className="error-text" role="alert">
                  {speech.error}
                </p>
              )}
              <RecordToggle value={keepAudio} onChange={setKeepAudio} />
              <MicTestButton />
              <TranscriptBox value={speech.transcript} onChange={speech.setTranscript} disabled={busy === "submitting"} />
            </>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" onClick={submit} disabled={!text || busy === "submitting"}>
            {busy === "submitting" ? "Marking your retake…" : `Submit retake (${left} of ${MAX_RETAKES} left)`}
          </button>
        </div>
      )}

      {!answering && !latest && <p className="helper-text">You've used all {MAX_RETAKES} retakes for this question.</p>}

      <div className="btn-full-row" style={{ marginTop: 16 }}>
        {latest && left > 0 && (
          <button type="button" className="btn btn-primary" onClick={again}>
            Retake again
          </button>
        )}
        <Link className={`btn ${latest && left > 0 ? "btn-secondary" : "btn-primary"}`} to={backTo}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
