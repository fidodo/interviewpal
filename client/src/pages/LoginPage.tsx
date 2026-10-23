import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../api/client";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: { theme: string; size: string; width: number }) => void;
    };
  };
}

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !googleButtonRef.current) return;
    const google = (window as unknown as { google?: GoogleIdentityServices }).google;
    if (!google) return;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setError(null);
        try {
          await loginWithGoogle(response.credential);
          navigate("/");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
        }
      },
    });
    google.accounts.id.renderButton(googleButtonRef.current, { theme: "outline", size: "large", width: 320 });
  }, [clientId, loginWithGoogle, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="hero">
        <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 18 }}>
          IP
        </span>
        <h1 className="hero-title">InterviewPal</h1>
        <p className="hero-subtitle">
          Practice real interview questions out loud, get graded on the spot, and walk away knowing exactly
          what to work on.
        </p>
      </div>
      <div className="card">
        {clientId ? (
          <div ref={googleButtonRef} style={{ display: "flex", justifyContent: "center" }} />
        ) : (
          <p className="helper-text">
            Set VITE_GOOGLE_CLIENT_ID in client/.env to enable Google sign-in.
          </p>
        )}
      </div>
      <div className="helper-text" style={{ textAlign: "center", margin: "4px 0" }}>
        or
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? <span className="spinner" /> : "Log in"}
        </button>
      </form>
    </div>
  );
}
