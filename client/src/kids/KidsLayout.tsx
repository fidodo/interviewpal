import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { kidsApi, PinResetMethod } from "./api";
import { clearKidLock, getKidLock, kidHomePath } from "./kidMode";
import { PinDialog } from "./components/PinDialog";

export function KidsLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  useLocation(); // re-render on navigation so the kid-mode lock below is current
  const lock = user ? getKidLock(user.id) : null;
  const [pinState, setPinState] = useState<{ hasPin: boolean; resetMethod: PinResetMethod } | null>(null);
  const [opening, setOpening] = useState(false);

  async function openGrownUps() {
    setOpening(true);
    try {
      const { hasPin, pinResetMethod } = await kidsApi.listChildren();
      setPinState({ hasPin, resetMethod: pinResetMethod });
    } catch {
      setPinState({ hasPin: true, resetMethod: "password" });
    } finally {
      setOpening(false);
    }
  }

  function unlock() {
    if (user) clearKidLock(user.id);
    setPinState(null);
    navigate("/kids/parent");
  }

  return (
    <div className="app-shell kids-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="kids-header">
        <Link to={lock ? kidHomePath(lock) : "/kids"} className="kids-brand">
          <span className="kids-brand-mark" aria-hidden="true">
            ✦
          </span>
          InterviewPal <span className="kids-brand-accent">Kids</span>
        </Link>
        <div className="kids-header-actions">
          {lock ? (
            <button type="button" className="btn btn-secondary" onClick={openGrownUps} disabled={opening}>
              Grown-ups
            </button>
          ) : (
            <>
              <Link to="/kids/parent" className="btn btn-secondary">
                Grown-ups area
              </Link>
              <Link to="/" className="btn-link">
                Back to InterviewPal
              </Link>
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="kids-main">
        {children}
      </main>
      {pinState && <PinDialog hasPin={pinState.hasPin} resetMethod={pinState.resetMethod} onSuccess={unlock} onClose={() => setPinState(null)} />}
    </div>
  );
}
