import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
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
              <span className="topbar-email">{user.email}</span>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
        {user && (
          <nav className="subnav" aria-label="Main">
            {navLink("/", "Dashboard")}
            {navLink("/history", "History")}
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="app-main">
        {children}
      </main>
    </div>
  );
}
