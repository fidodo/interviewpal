import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../api/client";
import { FeedbackCard } from "../components/FeedbackCard";
import { Feedback } from "../types";

const HOW_IT_WORKS = [
  { step: 1, title: "Pick a topic & difficulty", detail: "Frontend, backend, AI engineering, or your own — junior to senior." },
  { step: 2, title: "Answer out loud or in code", detail: "Speak your answer, or type a solution for coding questions." },
  { step: 3, title: "Get instant AI feedback", detail: "A score, a correctness/clarity/depth breakdown, and what to improve." },
];

const SAMPLE_FEEDBACK: Feedback = {
  score: 8,
  breakdown: { correctness: 9, clarity: 7, depth: 8 },
  strengths: ["Clear explanation of event delegation with a concrete example"],
  weaknesses: [],
  suggestions: ["Mention passive event listeners for scroll performance"],
};

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
  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !googleButtonRef.current) return;
    setGoogleUnavailable(false);

    let cancelled = false;
    let attempts = 0;

    const tryRender = () => {
      if (cancelled) return;
      const google = (window as unknown as { google?: GoogleIdentityServices }).google;
      if (!google) {
        attempts += 1;
        if (attempts >= 20) {
          setGoogleUnavailable(true);
          return;
        }
        setTimeout(tryRender, 250);
        return;
      }
      if (!googleButtonRef.current) return;

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
    };

    tryRender();
    return () => {
      cancelled = true;
    };
  }, [clientId, loginWithGoogle, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
  }

  return (
    <div className="page landing">
      <div className="hero-backdrop" aria-hidden="true">
        <span className="hero-blob hero-blob-a" />
        <span className="hero-blob hero-blob-b" />
      </div>

      <div className="hero">
        <span className="brand-mark brand-mark-lg reveal" style={{ ["--d" as string]: "0s" }} aria-hidden="true">
          IP
        </span>
        <h1 className="hero-title reveal" style={{ ["--d" as string]: "0.08s" }}>
          Interview<span className="hero-accent">Pal</span>
        </h1>
        <p className="hero-subtitle reveal" style={{ ["--d" as string]: "0.16s" }}>
          Practice real interview questions out loud or in code, get graded on the spot, and walk away knowing
          exactly what to work on.
        </p>
      </div>

      <section className="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title" className="visually-hidden">
          How it works
        </h2>
        {HOW_IT_WORKS.map((s, i) => (
          <div className="how-it-works-step reveal" key={s.step} style={{ ["--d" as string]: `${0.24 + i * 0.1}s` }}>
            <span className="step-number" aria-hidden="true">
              {s.step}
            </span>
            <h3 className="step-title">{s.title}</h3>
            <p className="helper-text" style={{ marginTop: 4 }}>
              {s.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="narrow-box reveal" style={{ marginBottom: 16, ["--d" as string]: "0.55s" }} aria-label="Sample feedback">
        <p className="helper-text" style={{ textAlign: "center", marginBottom: 8 }}>
          Real feedback, every answer
        </p>
        <FeedbackCard feedback={SAMPLE_FEEDBACK} animate />
      </section>

      <section className="narrow-box reveal" style={{ ["--d" as string]: "0.65s" }} aria-label="Sign in">
        <div className="card">
          {!clientId ? (
            <p className="helper-text">
              Set VITE_GOOGLE_CLIENT_ID in client/.env to enable Google sign-in.
            </p>
          ) : googleUnavailable ? (
            <p className="helper-text" style={{ textAlign: "center" }}>
              Google sign-in didn't load. Use email and password below instead.
            </p>
          ) : (
            <div ref={googleButtonRef} style={{ display: "flex", justifyContent: "center" }} />
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
              minLength={mode === "register" ? 8 : undefined}
              required
            />
            {mode === "register" && (
              <p className="helper-text" style={{ marginTop: 4 }}>
                At least 8 characters.
              </p>
            )}
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span className="visually-hidden">Signing in…</span>
              </>
            ) : mode === "register" ? (
              "Create account"
            ) : (
              "Log in"
            )}
          </button>
          {mode === "login" && (
            <Link to="/forgot-password" className="btn-link forgot-link">
              Forgot password?
            </Link>
          )}
          <button type="button" className="btn-link" onClick={toggleMode}>
            {mode === "register" ? "Already have an account? Log in" : "Don't have an account? Sign up"}
          </button>
        </form>
      </section>
    </div>
  );
}
