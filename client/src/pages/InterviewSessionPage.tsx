import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SessionDetail, Feedback, Question } from "../types";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { MicButton } from "../components/MicButton";
import { TranscriptBox } from "../components/TranscriptBox";
import { CodeAnswerBox } from "../components/CodeAnswerBox";
import { FeedbackCard } from "../components/FeedbackCard";

export function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const speech = useSpeechRecognition();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [codeAnswer, setCodeAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<"loading" | "generating" | "submitting" | "ending" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);

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
        if (unanswered) {
          setCurrentQuestion(unanswered);
          setBusy(null);
        } else if (res.session.status === "COMPLETED") {
          navigate(`/sessions/${id}/summary`);
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
      const res = await api.post<{ feedback: Feedback }>(`/questions/${currentQuestion.id}/answer`, {
        transcript: answerText,
      });
      setFeedback(res.feedback);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't grade your answer. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleEnd() {
    if (!id) return;
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
        {error ? <p className="error-text">{error}</p> : <p className="helper-text">Loading session…</p>}
      </div>
    );
  }

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
            <span className="badge">Question {questionCount}</span>
          </div>
        </div>
        <button className="btn btn-danger" onClick={handleEnd} disabled={busy !== null}>
          End Interview
        </button>
      </div>

      {currentQuestion && (
        <div className="card question-card">
          <div className="question-label">
            Question {currentQuestion.order}
            {currentQuestion.type === "CODING" && <span className="badge" style={{ marginLeft: 8 }}>Coding</span>}
          </div>
          <p style={{ fontSize: 17, margin: 0 }}>{currentQuestion.text}</p>
        </div>
      )}

      {busy === "generating" && <p className="helper-text">Thinking of your next question…</p>}

      {!feedback && currentQuestion && busy !== "generating" && (
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
              />
              {speech.error && <p className="error-text">{speech.error}</p>}
              <TranscriptBox value={speech.transcript} onChange={speech.setTranscript} disabled={busy === "submitting"} />
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleSubmitAnswer}
            disabled={!(currentQuestion.type === "CODING" ? codeAnswer : speech.transcript).trim() || busy === "submitting"}
          >
            {busy === "submitting" ? <span className="spinner" /> : "Submit Answer"}
          </button>
        </div>
      )}

      {feedback && (
        <>
          <FeedbackCard feedback={feedback} />
          <button className="btn btn-primary btn-block" onClick={() => id && loadNextQuestion(id)} disabled={busy !== null}>
            Next Question
          </button>
        </>
      )}
    </div>
  );
}
