import { useEffect, useRef, useState } from "react";

const COUNTDOWN_SECONDS = 5;

interface MicButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function MicButton({ isListening, isSupported, onStart, onStop, disabled }: MicButtonProps) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // E.g. the answer was submitted mid-countdown: never start recording afterwards.
  useEffect(() => {
    if (disabled) setCountdown(null);
  }, [disabled]);
  // Kept in a ref so a new onStart identity (it changes as the transcript changes) doesn't restart the tick.
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      onStartRef.current();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  function handleClick() {
    if (isListening) {
      onStop();
    } else if (countdown !== null) {
      setCountdown(null);
    } else {
      setCountdown(COUNTDOWN_SECONDS);
    }
  }

  const counting = countdown !== null;
  const label = isListening ? "Stop recording" : counting ? "Cancel countdown" : "Start recording";
  const status = !isSupported
    ? "Mic input not supported — type your answer below"
    : isListening
    ? "Listening… tap to stop"
    : counting
    ? `Get ready… recording starts in ${countdown}`
    : `Tap to speak — you'll get a ${COUNTDOWN_SECONDS}-second countdown`;

  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic-btn ${isListening ? "listening" : ""} ${counting ? "counting" : ""}`}
        onClick={handleClick}
        disabled={!isSupported || disabled}
        aria-label={label}
      >
        {isListening ? (
          <StopIcon />
        ) : counting ? (
          <span key={countdown} className="mic-countdown" aria-hidden="true">
            {countdown}
          </span>
        ) : (
          <MicIcon />
        )}
      </button>
      <span className="mic-status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
