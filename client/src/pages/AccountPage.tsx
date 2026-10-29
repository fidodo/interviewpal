import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useAuthConfig } from "../hooks/useAuthConfig";
import { GoogleConfirmButton } from "../components/GoogleConfirmButton";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function DeleteAccount({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmed = confirmText.trim().toLowerCase() === email.toLowerCase();

  async function remove(proof: { password?: string; credential?: string }) {
    if (!confirmed) {
      setError("Type your email address first to confirm.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api.del("/auth/account", proof);
      await refresh();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete your account."));
      setDeleting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    remove({ password });
  }

  return (
    <form className="card danger-zone" onSubmit={handleSubmit} aria-labelledby="delete-title">
      <h2 id="delete-title" className="card-title">
        Delete my account
      </h2>
      <p className="helper-text">
        This permanently deletes your account, interview history, custom topics and any kids' profiles and progress. It can't be undone.
      </p>
      <div className="field">
        <label htmlFor="delete-confirm">Type your email ({email}) to confirm</label>
        <input id="delete-confirm" className="input" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      {hasPassword ? (
        <>
          <div className="field">
            <label htmlFor="delete-password">Your password</label>
            <input
              id="delete-password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-danger" disabled={deleting || !confirmed || !password}>
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </>
      ) : (
        confirmed && (
          <>
            <p className="helper-text">Your account uses Google sign-in. Confirm with Google to delete it.</p>
            <GoogleConfirmButton onCredential={(credential) => remove({ credential })} />
          </>
        )
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const { emailEnabled } = useAuthConfig();
  const navigate = useNavigate();
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  if (!user) return null;

  async function resend() {
    setResendStatus(null);
    try {
      await api.post("/auth/verify-email/resend");
      setResendStatus("Sent. Check your inbox.");
    } catch (err) {
      setResendStatus(errorMessage(err, "Couldn't send the email."));
    }
  }

  // Ends every signed-in session (other browsers, a child's tablet in kid mode), not just this one.
  async function handleLogoutAll() {
    try {
      await api.post("/auth/logout-all");
    } finally {
      await logout();
      navigate("/login");
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Your account</h1>

      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title" className="card-title">
          Sign-in
        </h2>
        <p>
          <strong>{user.email}</strong>
          <br />
          <span className="helper-text">
            {user.hasPassword ? "Signs in with a password" : "Signs in with Google"} ·{" "}
            {user.emailVerified ? "Email confirmed" : "Email not confirmed yet"}
          </span>
        </p>
        {!user.emailVerified && emailEnabled && (
          <p>
            <button type="button" className="btn btn-secondary" onClick={resend}>
              Resend confirmation email
            </button>{" "}
            <span role="status" className="helper-text">
              {resendStatus}
            </span>
          </p>
        )}
        <button type="button" className="btn btn-secondary" onClick={handleLogoutAll}>
          Log out on all devices
        </button>
      </section>

      <DeleteAccount hasPassword={user.hasPassword} email={user.email} />
    </div>
  );
}
