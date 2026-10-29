import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAuthConfig } from "../hooks/useAuthConfig";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { emailEnabled } = useAuthConfig();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function navLink(to: string, label: string) {
    const active = location.pathname === to;
    return (
      <Link to={to} className={`subnav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
        {label}
      </Link>
    );
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="topbar">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              IP
            </span>
            InterviewPal
          </Link>
          {user && (
            <div className="topbar-actions">
              <Link to="/account" className="topbar-email" aria-current={location.pathname === "/account" ? "page" : undefined}>
                {user.email}
              </Link>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
        {user && (
          <nav className="subnav" aria-label="Main" data-tour="history-nav">
            {navLink("/", "Dashboard")}
            {navLink("/history", "History")}
            {navLink("/kids", "Kids")}
          </nav>
        )}
      </header>
      {user && emailEnabled && !user.emailVerified && (
        <div className="verify-banner" role="status">
          Please confirm your email to keep practising. Check your inbox, or <Link to="/account">resend the link</Link>.
        </div>
      )}
      <main id="main" tabIndex={-1} className="app-main">
        {children}
      </main>
    </div>
  );
}
