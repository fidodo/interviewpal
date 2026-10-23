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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="topbar">
          <Link to="/" className="brand">
            <span className="brand-mark">IP</span>
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
          <nav className="subnav">
            <Link to="/" className={`subnav-link ${location.pathname === "/" ? "active" : ""}`}>
              Dashboard
            </Link>
            <Link to="/history" className={`subnav-link ${location.pathname === "/history" ? "active" : ""}`}>
              History
            </Link>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
