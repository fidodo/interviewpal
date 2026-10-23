import { KeyboardEvent } from "react";

interface CodeAnswerBoxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeAnswerBox({ value, onChange, disabled }: CodeAnswerBoxProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const target = e.currentTarget;
    const { selectionStart, selectionEnd } = target;
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + 2;
    });
  }

  return (
    <div className="field">
      <label htmlFor="code-answer">Your code</label>
      <textarea
        id="code-answer"
        className="input code-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type your solution here…"
        spellCheck={false}
      />
    </div>
  );
}
