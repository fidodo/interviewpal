import { FormEvent, useEffect, useRef, useState } from "react";
import { kidsApi } from "../api";

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: { theme: string; size: string; text?: string; width?: number }) => void;
    };
  };
}

interface PinResetFormProps {
  method: "password" | "google";
  onDone: () => void;
  // Ids must be unique per page; the form can appear in the Grown-ups page and the PIN dialog.
  idPrefix: string;
}

// A forgotten PIN is reset by proving you're the account owner: the account password, or signing in with Google again.
export function PinResetForm({ method, onDone, idPrefix }: PinResetFormProps) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  async function reset(proof: { password?: string; credential?: string }) {
    if (pinRef.current.length !== 4) {
      setError("Type the new 4-digit PIN first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await kidsApi.resetPin(pinRef.current, proof);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the PIN");
    } finally {
      setSaving(false);
    }
  }
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    if (method !== "google" || !clientId || !googleRef.current) return;
    const google = (window as unknown as { google?: GoogleIdentityServices }).google;
    if (!google) {
      setError("Google sign-in didn't load. Refresh the page and try again.");
      return;
    }
    google.accounts.id.initialize({ client_id: clientId, callback: (res) => resetRef.current({ credential: res.credential }) });
    google.accounts.id.renderButton(googleRef.current, { theme: "outline", size: "large", text: "continue_with", width: 260 });
  }, [method, clientId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (method === "password") reset({ password });
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <form className="pin-reset" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`${idPrefix}-new-pin`}>New 4-digit PIN</label>
        <input
          id={`${idPrefix}-new-pin`}
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
        />
      </div>
      {method === "password" ? (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-account-password`}>Your InterviewPal password</label>
            <input
              id={`${idPrefix}-account-password`}
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving || pin.length !== 4 || !password}>
            {saving ? "Resetting…" : "Reset PIN"}
          </button>
        </>
      ) : (
        <>
          <p className="helper-text">Your account uses Google sign-in. Type the new PIN, then confirm it's you with Google.</p>
          <div ref={googleRef} />
        </>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
