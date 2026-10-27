import { KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TourStep {
  // CSS selector for the element to highlight. Steps whose target isn't on the page are skipped.
  target: string;
  title: string;
  body: string;
}

interface OnboardingTourProps {
  steps: TourStep[];
  onClose: () => void;
}

const GAP = 12;
const EDGE = 16;
const SPOTLIGHT_PAD = 6;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function OnboardingTour({ steps, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const popoverRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  const measure = useCallback(() => {
    const el = step ? document.querySelector(step.target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Find the step's target (skipping missing ones), scroll it into view, and keep its position updated.
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      const next = index + directionRef.current;
      if (next < 0 || next >= steps.length) onClose();
      else setIndex(next);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, index, steps.length, onClose, measure]);

  // Place the popover below the target, or above it if there isn't room, clamped to the viewport.
  useLayoutEffect(() => {
    const pop = popoverRef.current;
    if (!pop || !rect) return;
    const { offsetWidth: w, offsetHeight: h } = pop;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = rect.bottom + SPOTLIGHT_PAD + GAP;
    const above = rect.top - SPOTLIGHT_PAD - GAP - h;
    const top = below + h <= vh - EDGE || above < EDGE ? Math.min(below, vh - h - EDGE) : above;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, EDGE), vw - w - EDGE);
    setPos({ top: Math.max(top, EDGE), left });
  }, [rect, index]);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Make the rest of the app unreachable to keyboard and screen readers while the tour is open.
  useEffect(() => {
    const shell = document.querySelector(".app-shell");
    shell?.setAttribute("inert", "");
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      shell?.removeAttribute("inert");
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  // Esc closes the tour wherever focus happens to be.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function go(delta: 1 | -1) {
    directionRef.current = delta;
    if (delta === 1 && isLast) onClose();
    else setIndex((i) => Math.min(Math.max(i + delta, 0), steps.length - 1));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusables = popoverRef.current?.querySelectorAll<HTMLElement>("button");
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!step) return null;

  return createPortal(
    <div className="tour-root">
      <div className="tour-overlay" onClick={() => primaryRef.current?.focus()} />
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
          }}
        />
      )}
      <div
        ref={popoverRef}
        className="tour-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={handleKeyDown}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      >
        <p className="tour-progress">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p id="tour-body" className="tour-body">
          {step.body}
        </p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>
            {isLast ? "Close" : "Skip tour"}
          </button>
          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="btn btn-secondary tour-btn" onClick={() => go(-1)}>
                Back
              </button>
            )}
            <button ref={primaryRef} type="button" className="btn btn-primary tour-btn" onClick={() => go(1)}>
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
