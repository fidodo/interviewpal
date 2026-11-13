import { MouseEvent, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { NavIcon, NavIconName } from "./NavIcon";

// Phone navigation (shown at 720px and narrower; see `.bottom-nav` and `.menu-button` in styles.css): a bottom bar
// with the four everyday sections plus "More", and a full menu opened from it or from the top bar's hamburger.

export const SECTIONS: { to: string; label: string; icon: NavIconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/roles", label: "Roles", icon: "roles" },
  { to: "/learn", label: "Learn", icon: "learn" },
  { to: "/debug", label: "Debug", icon: "debug" },
  { to: "/design", label: "Design", icon: "design" },
  { to: "/speak", label: "Speak", icon: "speak" },
  { to: "/rag-lab", label: "RAG Lab", icon: "raglab" },
  { to: "/progress", label: "Progress", icon: "progress" },
  { to: "/history", label: "History", icon: "history" },
  { to: "/kids", label: "Kids", icon: "kids" },
];

const BOTTOM = ["/", "/learn", "/speak", "/progress"];

// A section counts as current on its own pages too (/speak/bank is Speak). Terms is reached from Learn.
function inSection(to: string, path: string) {
  if (to === "/") return path === "/";
  if (to === "/learn" && (path === "/terms" || path.startsWith("/terms/"))) return true;
  return path === to || path.startsWith(`${to}/`);
}

export function BottomNav({ onMore, menuOpen }: { onMore: () => void; menuOpen: boolean }) {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {SECTIONS.filter((s) => BOTTOM.includes(s.to)).map((s) => {
        const current = inSection(s.to, pathname);
        return (
          <Link key={s.to} to={s.to} className={`bottom-nav-item ${current ? "active" : ""}`} aria-current={current ? "page" : undefined}>
            <NavIcon name={s.icon} />
            <span>{s.label}</span>
          </Link>
        );
      })}
      <button type="button" className="bottom-nav-item" onClick={onMore} aria-haspopup="dialog" aria-expanded={menuOpen}>
        <NavIcon name="more" />
        <span>More</span>
      </button>
    </nav>
  );
}

export function MenuDialog({
  open,
  onClose,
  email,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onLogout: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Picking a link changes the route; close the menu then (also covers the browser's back button).
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // A click on the backdrop lands on the <dialog> element itself.
  function onDialogClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <dialog ref={ref} className="menu-dialog" id="app-menu" aria-labelledby="app-menu-title" onClose={onClose} onClick={onDialogClick}>
      <div className="menu-body">
        <div className="menu-header">
          <h2 id="app-menu-title" className="menu-title">
            Menu
          </h2>
          <button type="button" className="menu-close" onClick={onClose} aria-label="Close menu">
            <NavIcon name="close" />
          </button>
        </div>
        <nav aria-label="All sections">
          <ul className="menu-list">
            {SECTIONS.map((s) => {
              const current = inSection(s.to, pathname);
              return (
                <li key={s.to}>
                  <Link to={s.to} className={`menu-link ${current ? "active" : ""}`} aria-current={current ? "page" : undefined}>
                    <NavIcon name={s.icon} />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="menu-footer">
          <Link to="/account" className={`menu-link ${pathname === "/account" ? "active" : ""}`} aria-current={pathname === "/account" ? "page" : undefined}>
            <NavIcon name="account" />
            <span className="menu-account">
              Your account
              <span className="menu-email">{email}</span>
            </span>
          </Link>
          <button type="button" className="menu-link" onClick={onLogout}>
            <NavIcon name="logout" />
            Log out
          </button>
        </div>
      </div>
    </dialog>
  );
}
