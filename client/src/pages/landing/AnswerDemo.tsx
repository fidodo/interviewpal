import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackCard } from "../../components/FeedbackCard";
import { Feedback } from "../../types";

// The landing page's one piece of automatic motion: a spoken answer is "recorded", transcribed and marked, so a
// visitor sees what the app does before signing in. It plays once; "Play again" replays it on request. With reduced
// motion it starts on the finished state.

const QUESTION = "How does event delegation work in JavaScript?";
const TRANSCRIPT =
  "Instead of adding a listener to every list item, you add one to the parent. Clicks bubble up, so the parent's handler checks event.target to see which item was clicked. It uses less memory, and items added later work without new listeners.";
const WORDS = TRANSCRIPT.split(" ");
const ANSWER_SECONDS = 42;

const FEEDBACK: Feedback = {
  score: 8,
  breakdown: { correctness: 9, clarity: 7, depth: 8 },
  strengths: ["Clear explanation of event delegation with a concrete example"],
  weaknesses: [],
  suggestions: [],
};

// Milliseconds from the start of a run.
const RECORD_AT = 500;
const RECORD_FOR = 3000;
const MARKED_AFTER = 800;
const TICK = 50;

type Phase = "ready" | "recording" | "marking" | "marked";

const STATUS: Record<Phase, string> = {
  ready: "Ready",
  recording: "Recording",
  marking: "Marking your answer…",
  marked: "Marked",
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AnswerDemo() {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(reduced ? "marked" : "ready");
  const [progress, setProgress] = useState(reduced ? 1 : 0); // 0..1 through the recording
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clearTimers();
    setPhase("ready");
    setProgress(0);
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    later(RECORD_AT, () => setPhase("recording"));
    for (let t = TICK; t <= RECORD_FOR; t += TICK) later(RECORD_AT + t, () => setProgress(t / RECORD_FOR));
    later(RECORD_AT + RECORD_FOR, () => setPhase("marking"));
    later(RECORD_AT + RECORD_FOR + MARKED_AFTER, () => {
      setPhase("marked");
      setRun((r) => r + 1);
    });
  }, [clearTimers]);

  useEffect(() => {
    if (!reduced) play();
    return clearTimers;
  }, [reduced, play, clearTimers]);

  const shownWords = Math.round(progress * WORDS.length);
  const seconds = Math.round(progress * ANSWER_SECONDS);

  return (
    <figure className="answer-demo">
      <figcaption className="visually-hidden">
        Example: a spoken answer about event delegation in JavaScript, marked 8 out of 10.
      </figcaption>
      <div aria-hidden="true">
        <p className="demo-label">Question</p>
        <p className="demo-question">{QUESTION}</p>

        <div className={`demo-status demo-${phase}`}>
          <span className="demo-dot" />
          <span className="demo-status-text">{STATUS[phase]}</span>
          <span className="demo-meter">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </span>
          <span className="demo-clock">{clock(seconds)}</span>
        </div>

        {/* Every word is laid out from the start (unseen ones are invisible), so nothing below moves as it types. */}
        <p className="demo-transcript">
          {WORDS.map((w, i) => (
            <span key={i} className={i < shownWords ? "demo-word shown" : "demo-word"}>
              {w}{" "}
            </span>
          ))}
        </p>

        {/* An invisible copy holds the feedback's space; the real one mounts when marked, so its animations play then. */}
        <div className="demo-feedback">
          {phase === "marked" ? (
            <FeedbackCard key={run} feedback={FEEDBACK} animate={!reduced} />
          ) : (
            <div className="demo-feedback-placeholder">
              <FeedbackCard feedback={FEEDBACK} />
            </div>
          )}
        </div>
      </div>
      {!reduced && (
        // Never disabled: disabling it while it has focus would drop keyboard focus to the page.
        <button type="button" className="btn-link demo-replay" onClick={play}>
          Play again
        </button>
      )}
    </figure>
  );
}
