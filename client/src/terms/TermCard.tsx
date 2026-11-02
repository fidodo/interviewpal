import { useEffect, useState } from "react";
import { TermReveal } from "./types";

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

// Reads the term aloud with the browser's built-in voice (free, no network). Hidden where unsupported; any speech
// still playing is cancelled when the button goes away.
export function HearIt({ text }: { text: string }) {
  const [supported] = useState(canSpeak);
  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, [text]);
  if (!supported) return null;
  return (
    <button
      type="button"
      className="btn-link btn-link-inline tm-hear"
      aria-label={`Hear how to say "${text}"`}
      onClick={() => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }}
    >
      Hear it
    </button>
  );
}

// The full term: what you'd learn from a good glossary entry, plus the interview angle.
export function TermCard({ term, interviewQuestion, headingLevel = 3 }: { term: TermReveal; interviewQuestion?: string; headingLevel?: 2 | 3 | 4 }) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className="tm-card">
      <div className="tm-card-head">
        <Heading className="tm-term">{term.term}</Heading>
        <HearIt text={term.term} />
      </div>
      <p className="tm-oneliner">{term.oneLiner}</p>
      <p>{term.explanation}</p>
      <p className="tm-example">
        <span className="tm-label">Say it like this:</span> “{term.example}”
      </p>
      <ul className="feedback-list">
        {term.keyPoints.map((k, i) => (
          <li key={i}>{k}</li>
        ))}
      </ul>
      {term.confusedWith && (
        <p className="helper-text">
          <span className="tm-label">Often confused with:</span> {term.confusedWith}
        </p>
      )}
      {interviewQuestion && (
        <p className="helper-text">
          <span className="tm-label">Comes up in:</span> {interviewQuestion}
        </p>
      )}
    </div>
  );
}
