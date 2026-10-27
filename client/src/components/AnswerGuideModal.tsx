import { useEffect, useRef } from "react";

interface AnswerGuideModalProps {
  open: boolean;
  onClose: () => void;
  // Where focus goes on close when nothing meaningful was focused before opening (e.g. auto-open on page load).
  fallbackFocusSelector?: string;
}

export function AnswerGuideModal({ open, onClose, fallbackFocusSelector }: AnswerGuideModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closedRef = useRef(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      closedRef.current = false;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Runs on both `cancel` (Esc) and `close`: when Esc is pressed right after the dialog opens, Chrome can
  // close it without firing `close`, which would leave `open` stuck true and the guide impossible to reopen.
  function handleClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
    const previous = returnFocusRef.current;
    // Deferred so it runs after the browser's own dialog focus restoration.
    requestAnimationFrame(() => {
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus();
      } else if (fallbackFocusSelector) {
        document.querySelector<HTMLElement>(fallbackFocusSelector)?.focus();
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="guide-dialog"
      aria-labelledby="guide-title"
      onClose={handleClose}
      onCancel={handleClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="guide-body">
        <div className="guide-header">
          <h2 id="guide-title" className="guide-title">
            How you're graded
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => dialogRef.current?.close()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <section className="guide-section">
          <h3>Your score</h3>
          <p>
            Each answer gets an overall score out of 10, plus three sub-scores. The bar rises with the difficulty you
            picked.
          </p>
          <ul className="guide-rubric">
            <li>
              <strong>Correctness</strong> — is it accurate and complete?
            </li>
            <li>
              <strong>Clarity</strong> — is it well-structured and easy to follow?
            </li>
            <li>
              <strong>Depth</strong> — nuance, tradeoffs, edge cases, going beyond the obvious.
            </li>
          </ul>
          <p className="helper-text">Spoken answers also get a filler-word count ("um", "like", "you know").</p>
        </section>

        <section className="guide-section">
          <h3>Structure spoken answers (STAR)</h3>
          <ol className="guide-star">
            <li>
              <strong>Situation</strong> — set the context in one sentence.
            </li>
            <li>
              <strong>Task</strong> — name the problem or goal.
            </li>
            <li>
              <strong>Action</strong> — explain how it works or what you'd do, and why. Mention tradeoffs.
            </li>
            <li>
              <strong>Result</strong> — the outcome, plus edge cases or what you'd improve.
            </li>
          </ol>
        </section>

        <section className="guide-section">
          <h3>Coding questions</h3>
          <p>
            Type your solution in the plain text box. Logic and edge cases count more than exact syntax — mention time
            and space complexity if relevant.
          </p>
        </section>

        <section className="guide-section">
          <h3>Using the mic</h3>
          <ul>
            <li>Tap the mic, and you'll get a 5-second countdown before recording starts.</li>
            <li>A quiet room or a headset gives the most accurate transcript.</li>
            <li>Read your transcript and fix any mis-heard words before you submit.</li>
          </ul>
        </section>

        <button type="button" className="btn btn-primary btn-block" onClick={() => dialogRef.current?.close()}>
          Got it, let's start
        </button>
      </div>
    </dialog>
  );
}
