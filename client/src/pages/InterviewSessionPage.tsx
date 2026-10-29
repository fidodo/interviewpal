import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionDetail, Feedback, FillerStats, Question, ROUND_LABELS } from "../types";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { MicButton } from "../components/MicButton";
import { MicTestButton } from "../components/MicTestButton";
import { TranscriptBox } from "../components/TranscriptBox";
import { CodeAnswerBox } from "../components/CodeAnswerBox";
import { FeedbackCard } from "../components/FeedbackCard";
import { AnswerGuideModal } from "../components/AnswerGuideModal";

export function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const speech = useSpeechRecognition();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [codeAnswer, setCodeAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fillerStats, setFillerStats] = useState<FillerStats | null>(null);
  const [busy, setBusy] = useState<"loading" | "generating" | "submitting" | "ending" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  // Mock interviews: the current answer is saved (feedback is held back) and we're waiting to move on.
  const [answerSaved, setAnswerSaved] = useState(false);
  // Shown at the start of every session, but not again when reloading or resuming the same one.
  const guideSeenKey = `guide-seen:${id}`;
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return sessionStorage.getItem(guideSeenKey) === null;
    } catch {
      return true;
    }
  });

  function closeGuide() {
    setGuideOpen(false);
    try {
      sessionStorage.setItem(guideSeenKey, "1");
    } catch {
      // storage unavailable (private mode) — the guide just shows again next load
    }
  }

  const loadNextQuestion = useCallback(
    async (sessionId: string) => {
      setBusy("generating");
      setError(null);
      try {
        const res = await api.post<{ question: Question }>(`/sessions/${sessionId}/questions`);
        setCurrentQuestion(res.question);
        setQuestionCount((n) => n + 1);
        speech.resetTranscript();
        setCodeAnswer("");
        setFeedback(null);
        setFillerStats(null);
        setAnswerSaved(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't generate a question. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [speech]
  );

  useEffect(() => {
    if (!id) return;
    api
      .get<{ session: SessionDetail }>(`/sessions/${id}`)
      .then((res) => {
        setSession(res.session);
        const unanswered = res.session.questions.find((q) => !q.answer);
        setQuestionCount(res.session.questions.length);
        const last = res.session.questions[res.session.questions.length - 1];
        if (res.session.status === "COMPLETED") {
          // Finished sessions (including ones ended early with a question still open) go to their report.
          navigate(`/sessions/${id}/summary`, { replace: true });
        } else if (unanswered) {
          setCurrentQuestion(unanswered);
          setBusy(null);
        } else if (res.session.mode === "MOCK" && last && res.session.questions.length >= (res.session.plannedRounds ?? 0)) {
          // Every round answered but not finished yet (e.g. a reload): offer the report.
          setCurrentQuestion(last);
          setAnswerSaved(true);
          setBusy(null);
        } else {
          loadNextQuestion(id);
        }
      })
      .catch(() => setError("Couldn't load this session."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmitAnswer() {
    if (!id || !currentQuestion) return;
    const isCoding = currentQuestion.type === "CODING";
    const answerText = (isCoding ? codeAnswer : speech.transcript).trim();
    if (!answerText) return;
    speech.stop();
    setBusy("submitting");
    setError(null);
    try {
      const res = await api.post<{ answer: { fillerStats: FillerStats | null }; feedback: Feedback }>(
        `/questions/${currentQuestion.id}/answer`,
        { transcript: answerText }
      );
      if (res.feedback) {
        setFeedback(res.feedback);
        setFillerStats(res.answer.fillerStats);
      } else {
        setAnswerSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't grade your answer. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleEnd(confirmFirst = true) {
    if (!id) return;
    if (confirmFirst && !window.confirm("End this interview now? You won't be able to add more answers.")) return;
    setBusy("ending");
    try {
      await api.post(`/sessions/${id}/end`);
      navigate(`/sessions/${id}/summary`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't end the session. Try again.");
      setBusy(null);
    }
  }

  if (!session) {
    return (
      <div className="page">
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : (
          <p className="helper-text" role="status">
            Loading session…
          </p>
        )}
      </div>
    );
  }

  const isMock = session.mode === "MOCK";
  const totalRounds = session.plannedRounds ?? 0;
  const isLastRound = isMock && currentQuestion != null && currentQuestion.order >= totalRounds;

  return (
    <div className="page">
      <div className="session-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {session.topic.name}
          </h1>
          <div className="history-tags">
            <span className="badge badge-primary">{session.track}</span>
            <span className="badge">{session.difficulty}</span>
            <span className="badge">{isMock ? `Question ${currentQuestion?.order ?? questionCount} of ${totalRounds}` : `Question ${questionCount}`}</span>
          </div>
          {isMock && <p className="helper-text mock-note">Like a real interview: you'll get all your feedback and a verdict at the end.</p>}
        </div>
        <button className="btn btn-danger" onClick={() => handleEnd()} disabled={busy !== null}>
          {isMock ? "End early" : "End Interview"}
        </button>
      </div>

      <AnswerGuideModal open={guideOpen} onClose={closeGuide} fallbackFocusSelector=".mic-btn, #code-answer, #transcript" />

      {currentQuestion && (
        <div className="card question-card">
          <div className="question-card-top">
            <h2 className="question-label">
              Question {currentQuestion.order}
              {currentQuestion.round && <span className="badge badge-primary" style={{ marginLeft: 8 }}>{ROUND_LABELS[currentQuestion.round]}</span>}
              {currentQuestion.type === "CODING" && <span className="badge" style={{ marginLeft: 8 }}>Coding</span>}
            </h2>
            <button type="button" className="btn-link btn-link-inline" onClick={() => setGuideOpen(true)}>
              How you're graded
            </button>
          </div>
          <p className="question-text">{currentQuestion.text}</p>
        </div>
      )}

      {busy === "generating" && (
        <p className="helper-text" role="status">
          Thinking of your next question…
        </p>
      )}

      {answerSaved && (
        <div className="card mock-saved" role="status">
          <p>
            <strong>Answer saved.</strong> {isLastRound ? "That was the last question." : "Take a breath, then carry on when you're ready."}
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {isLastRound ? (
            <button className="btn btn-primary btn-block" onClick={() => handleEnd(false)} disabled={busy !== null}>
              {busy === "ending" ? "Writing your report…" : "Finish and see my report"}
            </button>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => id && loadNextQuestion(id)} disabled={busy !== null}>
              Next question
            </button>
          )}
        </div>
      )}

      {!feedback && !answerSaved && currentQuestion && busy !== "generating" && (
        <div className="card">
          {currentQuestion.type === "CODING" ? (
            <CodeAnswerBox value={codeAnswer} onChange={setCodeAnswer} disabled={busy === "submitting"} />
          ) : (
            <>
              <MicButton
                isListening={speech.isListening}
                isSupported={speech.isSupported}
                onStart={speech.start}
                onStop={speech.stop}
                disabled={busy === "submitting"}
              />
              {speech.error && (
                <p className="error-text" role="alert">
                  {speech.error}
                </p>
              )}
              <MicTestButton />
              <TranscriptBox value={speech.transcript} onChange={speech.setTranscript} disabled={busy === "submitting"} />
            </>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary btn-block"
            onClick={handleSubmitAnswer}
            disabled={!(currentQuestion.type === "CODING" ? codeAnswer : speech.transcript).trim() || busy === "submitting"}
          >
            {busy === "submitting" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span className="visually-hidden">Grading your answer…</span>
              </>
            ) : (
              "Submit Answer"
            )}
          </button>
        </div>
      )}

      {feedback && (
        <>
          <FeedbackCard feedback={feedback} fillerStats={fillerStats} />
          <button className="btn btn-primary btn-block" onClick={() => id && loadNextQuestion(id)} disabled={busy !== null}>
            Next Question
          </button>
        </>
      )}
    </div>
  );
}
