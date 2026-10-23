interface MicButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ isListening, isSupported, onStart, onStop }: MicButtonProps) {
  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic-btn ${isListening ? "listening" : ""}`}
        onClick={isListening ? onStop : onStart}
        disabled={!isSupported}
        aria-label={isListening ? "Stop recording" : "Start recording"}
      >
        {isListening ? "■" : "🎙"}
      </button>
      <span className="mic-status">
        {!isSupported
          ? "Mic input not supported — type your answer below"
          : isListening
          ? "Listening… tap to stop"
          : "Tap to speak your answer"}
      </span>
    </div>
  );
}
