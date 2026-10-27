import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { kidsApi } from "../api";
import { kidHomePath, setKidLock } from "../kidMode";
import { AvatarIcon } from "../components/bits";
import { Child } from "../types";

export function KidsHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kidsApi
      .listChildren()
      .then((res) => setChildren(res.children))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load learners"));
  }, []);

  if (children && children.length === 0) return <Navigate to="/kids/parent" replace />;

  function start(child: Child) {
    if (user) setKidLock(user.id, child.id);
    navigate(kidHomePath(child.id));
  }

  return (
    <div className="kids-page">
      <h1 className="kids-title">Who's learning today?</h1>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!children && !error && <p className="helper-text">Loading…</p>}
      {children && (
        <ul className="kid-picker" aria-label="Learners">
          {children.map((child) => (
            <li key={child.id}>
              <button type="button" className="kid-picker-btn" onClick={() => start(child)}>
                <AvatarIcon avatar={child.avatar} size="lg" />
                <span className="kid-picker-name">{child.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="kids-footnote">
        Picking a learner turns on kid mode. A grown-up's PIN is needed to leave it. <Link to="/kids/parent">Manage learners</Link>
      </p>
    </div>
  );
}
