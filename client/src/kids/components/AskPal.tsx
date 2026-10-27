import { FormEvent, useEffect, useRef, useState } from "react";
import { kidsApi } from "../api";
import { HelpMessage } from "../types";

const SUGGESTIONS = ["I'm stuck. Can I have a hint?", "What does my error mean?", "Can you explain the instructions?"];

interface AskPalProps {
  challengeId: string;
  getCode: () => string;
  initialMessages: HelpMessage[];
  childName: string;
}

export function AskPal({ challengeId, getCode, initialMessages, childName }: AskPalProps) {
  const [messages, setMessages] = useState<HelpMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await kidsApi.help(challengeId, message, getCode());
      setMessages((prev) => [...prev, ...res.messages]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pal couldn't answer just now. Try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  return (
    <section className="kids-card ask-pal" aria-labelledby="ask-pal-title">
      <h2 id="ask-pal-title" className="kids-card-title">
        <span aria-hidden="true">🤖</span> Ask Pal
      </h2>
      <ol ref={listRef} className="pal-chat" aria-live="polite" aria-label="Chat with Pal">
        {messages.length === 0 && (
          <li className="pal-msg pal-msg-pal">Hi {childName}! I'm Pal. If you get stuck, ask me and I'll give you a hint.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`pal-msg ${m.role === "PAL" ? "pal-msg-pal" : "pal-msg-child"}`}>
            <span className="visually-hidden">{m.role === "PAL" ? "Pal: " : "You: "}</span>
            {m.text}
          </li>
        ))}
        {sending && <li className="pal-msg pal-msg-pal pal-thinking">Pal is thinking…</li>}
      </ol>
      <div className="pal-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="pal-chip" onClick={() => send(s)} disabled={sending}>
            {s}
          </button>
        ))}
      </div>
      <form className="pal-form" onSubmit={handleSubmit}>
        <label htmlFor="pal-input" className="visually-hidden">
          Your question for Pal
        </label>
        <input
          id="pal-input"
          className="input"
          value={draft}
          maxLength={500}
          placeholder="Ask Pal a question…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
