import { useEffect, useRef, useState } from "react";
import { REWARDS_EVENT, Reward } from "./types";

const SHOW_MS = 8000;
const MAX_SHOWN = 3;

export function RewardIcon({ type }: { type: Reward["type"] }) {
  if (type === "streak") {
    // A flame.
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2c.6 3-1.4 4.9-2.9 6.6C7.7 10.2 6 12 6 14.8 6 18.2 8.7 21 12 21s6-2.8 6-6.2c0-2.3-1.1-3.8-2.2-5-.2 1.6-1 2.8-2.3 3.2.6-3.4-.4-7-1.5-11z" />
      </svg>
    );
  }
  if (type === "best") {
    // A star.
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
      </svg>
    );
  }
  // A medal.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M7 2h4l1.5 4L14 2h3l-3 7.2A6 6 0 1 1 10 9.2zM12 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" />
    </svg>
  );
}

// Small celebrations (a streak day, a badge, a personal best) that any graded action can return. They're also
// kept elsewhere (the dashboard's Today card, the badge shelf on the progress page), so a toast that fades after
// a few seconds loses nothing. Hovering or focusing a toast keeps it on screen.
export function RewardToaster() {
  const [toasts, setToasts] = useState<(Reward & { id: number })[]>([]);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    function onRewards(e: Event) {
      const rewards = (e as CustomEvent<Reward[]>).detail;
      setToasts((list) => [...list, ...rewards.map((r) => ({ ...r, id: nextId.current++ }))].slice(-MAX_SHOWN));
    }
    window.addEventListener(REWARDS_EVENT, onRewards);
    return () => window.removeEventListener(REWARDS_EVENT, onRewards);
  }, []);

  useEffect(() => {
    if (paused || toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((list) => list.slice(1)), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [toasts, paused]);

  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    // Always in the page, so screen readers announce what's added to it.
    <div
      className="reward-toasts"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toasts.map((t) => (
        <div key={t.id} className={`reward-toast reward-${t.type}`}>
          <span className="reward-icon">
            <RewardIcon type={t.type} />
          </span>
          <div className="reward-body">
            <strong>{t.title}</strong>
            <span>{t.message}</span>
          </div>
          <button type="button" className="reward-close" aria-label={`Dismiss: ${t.title}`} onClick={() => dismiss(t.id)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
