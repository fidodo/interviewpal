import { FormEvent, useEffect, useRef, useState } from "react";
import { kidsApi, PinResetMethod } from "../api";
import { PinResetForm } from "./PinResetForm";

interface PinDialogProps {
  hasPin: boolean;
  resetMethod: PinResetMethod;
  onSuccess: () => void;
  onClose: () => void;
}

// Mount it to open it. Uses the native <dialog> for the focus trap and Esc handling, like AnswerGuideModal.
export function PinDialog({ hasPin, resetMethod, onSuccess, onClose }: PinDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => {
      const previous = returnFocusRef.current;
      requestAnimationFrame(() => previous?.isConnected && previous.focus());
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasPin) return onSuccess();
    setChecking(true);
    setError(null);
    try {
      await kidsApi.verifyPin(pin);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That PIN isn't right");
      setPin("");
    } finally {
      setChecking(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="guide-dialog pin-dialog" aria-labelledby="pin-title" onClose={onClose} onCancel={onClose}>
      <div className="guide-body">
        <div className="guide-header">
          <h2 id="pin-title" className="guide-title">
            Grown-ups only
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => dialogRef.current?.close()}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {forgot ? (
          <PinResetForm method={resetMethod} idPrefix="dialog" onDone={onSuccess} />
        ) : (
          <form onSubmit={handleSubmit}>
            {hasPin ? (
              <div className="field">
                <label htmlFor="pin-input">Enter the 4-digit PIN</label>
                <input
                  id="pin-input"
                  className="input pin-input"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            ) : (
              <p className="helper-text">No PIN is set yet, so anyone can leave kid mode. Set one in the Grown-ups area to lock it.</p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="pin-actions">
              {hasPin && (
                <button type="button" className="btn-link" onClick={() => setForgot(true)}>
                  Forgot PIN?
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={checking || (hasPin && pin.length !== 4)}>
                {checking ? "Checking…" : "Continue"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
