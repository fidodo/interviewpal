import { FormEvent, useState } from "react";
import { kidsApi, PinResetMethod } from "../api";
import { PinResetForm } from "../components/PinResetForm";
import { errorMessage } from "../errorMessage";

// Set or change the kid-mode PIN, or reset a forgotten one.
export function PinForm({ hasPin, resetMethod, onSaved }: { hasPin: boolean; resetMethod: PinResetMethod; onSaved: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    try {
      await kidsApi.setPin(pin, hasPin && currentPin ? currentPin : undefined);
      setPin("");
      setCurrentPin("");
      setStatus("PIN saved.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the PIN"));
    }
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  if (forgot) {
    return (
      <PinResetForm
        method={resetMethod}
        idPrefix="parent"
        onDone={() => {
          setForgot(false);
          setStatus("PIN reset.");
          onSaved();
        }}
      />
    );
  }

  return (
    <form className="pin-form" onSubmit={handleSubmit}>
      {hasPin && (
        <div className="field">
          <label htmlFor="current-pin">Current PIN</label>
          <input id="current-pin" className="input" type="password" inputMode="numeric" autoComplete="off" value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value))} />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-pin">{hasPin ? "New 4-digit PIN" : "Choose a 4-digit PIN"}</label>
        <input id="new-pin" className="input" type="password" inputMode="numeric" autoComplete="off" required value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pin.length !== 4}>
        {hasPin ? "Change PIN" : "Set PIN"}
      </button>
      {hasPin && (
        <button type="button" className="btn-link pin-forgot" onClick={() => setForgot(true)}>
          Forgot PIN?
        </button>
      )}
      <p role="status" className="helper-text">
        {status}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
