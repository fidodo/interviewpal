import { FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import { learnApi } from "../api/learn";
import { LearnAnswerResult, LearnQuestion } from "../types";

interface LearnQuestionCardProps {
  question: LearnQuestion;
  number: number;
  fromReview?: boolean;
  onAnswered?: (result: LearnAnswerResult) => void;
}

// One multiple-choice or written question. Marking happens on the server; the correct answer only arrives after
// the learner has answered.
export function LearnQuestionCard({ question, number, fromReview = false, onAnswered }: LearnQuestionCardProps) {
  const [choice, setChoice] = useState<number | null>(question.result?.response != null && question.kind === "MCQ" ? Number(question.result.response) : null);
  const [text, setText] = useState(question.kind === "SHORT" ? (question.result?.response ?? "") : "");
  const [result, setResult] = useState<LearnAnswerResult | null>(question.result ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupName = `q-${question.id}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        question.kind === "MCQ" ? await learnApi.answerChoice(question.id, choice!, fromReview) : await learnApi.answerWritten(question.id, text.trim(), fromReview);
      setResult(res.result);
      onAnswered?.(res.result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check your answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const answered = result != null;

  return (
    <form className={`card learn-question ${answered ? (result.correct ? "is-correct" : "is-wrong") : ""}`} onSubmit={handleSubmit}>
      <fieldset disabled={answered || busy}>
        <legend className="learn-question-prompt">
          <span className="learn-question-number">Question {number}</span>
          {question.prompt}
        </legend>
        {question.kind === "MCQ" ? (
          <div className="learn-options">
            {question.options.map((option, i) => {
              const state = answered ? (i === result.correctIndex ? "option-correct" : i === choice ? "option-wrong" : "") : "";
              return (
                <label key={i} className={`learn-option ${choice === i ? "selected" : ""} ${state}`}>
                  <input type="radio" name={groupName} value={i} checked={choice === i} onChange={() => setChoice(i)} />
                  <span>{option}</span>
                  {state === "option-correct" && <span className="option-tag">Correct answer</span>}
                  {state === "option-wrong" && <span className="option-tag">Your answer</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${groupName}-text`} className="visually-hidden">
              Your answer
            </label>
            <textarea
              id={`${groupName}-text`}
              className="input"
              rows={4}
              maxLength={3000}
              placeholder="Answer in a few sentences, as you would in an interview"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      {!answered && (
        <button type="submit" className="btn btn-primary" disabled={busy || (question.kind === "MCQ" ? choice == null : !text.trim())}>
          {busy ? "Checking…" : "Check answer"}
        </button>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <div role="status">
        {answered && (
          <div className="learn-result">
            <p className="learn-verdict">{result.correct ? "Correct" : "Not quite"}</p>
            {result.feedback && <p>{result.feedback}</p>}
            {result.modelAnswer && (
              <p>
                <strong>A strong answer covers:</strong> {result.modelAnswer}
              </p>
            )}
            {result.explanation && <p className="helper-text">{result.explanation}</p>}
            {!result.correct && result.nextReviewDays != null && <p className="helper-text">This question will come back in Review tomorrow.</p>}
            {result.correct && result.mastered && <p className="helper-text">Mastered: it won't come back again.</p>}
            {result.correct && fromReview && !result.mastered && result.nextReviewDays != null && (
              <p className="helper-text">Next review in {result.nextReviewDays} days.</p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
