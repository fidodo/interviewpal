interface TranscriptBoxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TranscriptBox({ value, onChange, disabled }: TranscriptBoxProps) {
  return (
    <div className="field">
      <label htmlFor="transcript">Your answer (editable — fix any mis-heard words before submitting)</label>
      <textarea
        id="transcript"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Speak using the mic above, or type your answer here…"
        rows={5}
      />
    </div>
  );
}
