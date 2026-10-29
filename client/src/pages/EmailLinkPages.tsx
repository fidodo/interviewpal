import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useAuthConfig } from "../hooks/useAuthConfig";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// Opened from the link in the verification email.
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [message, setMessage] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    // Tokens are single-use, so don't send it twice (React StrictMode runs effects twice in development).
    if (sent.current) return;
    sent.current = true;
    api
      .post("/auth/verify-email", { token: params.get("token") ?? "" })
      .then(async () => {
        await refresh();
        setState("done");
      })
      .catch((err) => {
        setMessage(errorMessage(err, "This link didn't work."));
        setState("failed");
      });
  }, [params, refresh]);

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Confirm your email</h1>
      <div className="card" role="status">
        {state === "checking" && <p className="helper-text">Checking your link…</p>}
        {state === "done" && (
          <>
            <p>Thanks, your email is confirmed.</p>
            <Link to="/" className="btn btn-primary">
              Go to InterviewPal
            </Link>
          </>
        )}
        {state === "failed" && <p className="error-text">{message}</p>}
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { emailEnabled } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post("/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the email. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Forgot your password?</h1>
      {emailEnabled === false ? (
        <div className="card">
          <p>Password reset by email isn't set up on this site yet.</p>
          <p className="helper-text">If you signed up with Google, use "Sign in with Google" on the login page instead.</p>
          <Link to="/login">Back to log in</Link>
        </div>
      ) : sent ? (
        <div className="card" role="status">
          <p>If there's an account for {email}, we've sent a link to reset its password. It works for one hour.</p>
          <Link to="/login">Back to log in</Link>
        </div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="forgot-email">Email</label>
            <input id="forgot-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={sending || emailEnabled === null}>
            {sending ? "Sending…" : "Send reset link"}
          </button>
          <Link to="/login" className="btn-link">
            Back to log in
          </Link>
        </form>
      )}
    </div>
  );
}

// Opened from the link in the password reset email. A successful reset also signs you in.
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/password/reset", { token: params.get("token") ?? "", password });
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Couldn't reset your password."));
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Choose a new password</h1>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="helper-text">At least 8 characters. You'll be signed out on your other devices.</p>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
