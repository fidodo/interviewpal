import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
    <div className="page">
      <div className="hero">
        <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 18 }}>
          IP
        </span>
        <h1 className="hero-title">InterviewPal</h1>
        <p className="hero-subtitle">
          Practice real interview questions out loud or in code, get graded on the spot, and walk away knowing
          exactly what to work on.
        </p>
      </div>

      <div className="how-it-works">
        {HOW_IT_WORKS.map((s) => (
          <div className="how-it-works-step" key={s.step}>
            <span className="step-number">{s.step}</span>
            <div style={{ fontWeight: 700, marginTop: 8 }}>{s.title}</div>
            <p className="helper-text" style={{ marginTop: 4 }}>
              {s.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="narrow-box" style={{ marginBottom: 16 }}>
        <p className="helper-text" style={{ textAlign: "center", marginBottom: 8 }}>
          Real feedback, every answer
        </p>
        <FeedbackCard feedback={SAMPLE_FEEDBACK} />
      </div>

      <div className="narrow-box">
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
    </div>
  );
}
