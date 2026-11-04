import { useEffect, useRef, useState } from "react";

// Copies text to the clipboard and says so politely. Where the clipboard API isn't available or is refused, the text
// is shown selected in a read-only box so it can be copied by hand.
export function CopyButton({ text, label, className = "btn-link btn-link-inline copy-btn" }: { text: string | (() => string); label: string; className?: string }) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<number>();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback !== null) boxRef.current?.select();
  }, [fallback]);

  async function copy() {
    const value = typeof text === "function" ? text() : text;
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setFallback(null);
      setStatus("Copied");
      timer.current = window.setTimeout(() => setStatus(""), 2000);
    } catch {
      setFallback(value);
      setStatus("Press Ctrl+C (or Cmd+C) to copy the selected code");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={copy}>
        {label}
      </button>
      <span className="copy-status" aria-live="polite">
        {status}
      </span>
      {fallback !== null && (
        <textarea ref={boxRef} className="input copy-fallback" readOnly rows={6} value={fallback} aria-label={`${label}: selected, ready to copy`} onBlur={() => setFallback(null)} />
      )}
    </>
  );
}
