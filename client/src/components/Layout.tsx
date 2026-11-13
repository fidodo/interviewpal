import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAuthConfig } from "../hooks/useAuthConfig";
import { RewardToaster } from "../today/RewardToaster";
import { BrandMark } from "./BrandMark";
import { BottomNav, MenuDialog } from "./MobileNav";
import { NavIcon } from "./NavIcon";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { emailEnabled } = useAuthConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
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
    <div className={`app-shell ${user ? "has-bottom-nav" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="topbar">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-name">
              Interview<span className="brand-name-pal">Pal</span>
            </span>
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
          {user && (
            // Phones only (styles.css): the top bar's way into the full menu. On phones History lives in this menu,
            // so the dashboard tour's "History" step points here when the desktop nav is hidden.
            <button
              type="button"
              className="menu-button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls="app-menu"
              data-tour="history-nav"
            >
              <NavIcon name="menu" />
              <span className="visually-hidden">Menu</span>
            </button>
          )}
        </div>
        {user && (
          <nav className="subnav" aria-label="Main" data-tour="history-nav">
            {navLink("/", "Home")}
            {navLink("/roles", "Roles")}
            {navLink("/learn", "Learn")}
            {navLink("/debug", "Debug")}
            {navLink("/design", "Design")}
            {navLink("/speak", "Speak")}
            {navLink("/rag-lab", "RAG Lab")}
            {navLink("/progress", "Progress")}
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
      {user && (
        <>
          <BottomNav onMore={() => setMenuOpen(true)} menuOpen={menuOpen} />
          <MenuDialog open={menuOpen} onClose={() => setMenuOpen(false)} email={user.email} onLogout={handleLogout} />
          <RewardToaster />
        </>
      )}
    </div>
  );
}
