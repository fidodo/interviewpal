import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { rolesApi } from "../api/roles";
import { LEVEL_LABELS, RoleListItem } from "../types";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function RolesPage() {
  const [roles, setRoles] = useState<RoleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rolesApi
      .list()
      .then((res) => setRoles(res.roles))
      .catch((err) => setError(errorMessage(err, "Couldn't load your roles")));
  }, []);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(errorMessage(err, fallback));
    }
  }

  return (
    <div className="page">
      <div className="dashboard-heading">
        <div>
          <h1 className="page-title">Target roles</h1>
          <p className="page-subtitle">The jobs you're working towards. Your home page follows the active one.</p>
        </div>
        <Link to="/roles/new" className="btn btn-primary">
          Add a role
        </Link>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!roles && !error && <p className="helper-text">Loading…</p>}
      {roles && roles.length === 0 && (
        <div className="card">
          <p>You haven't added a target role yet.</p>
          <Link to="/roles/new" className="btn btn-primary">
            Set my target role
          </Link>
        </div>
      )}
      {roles && roles.length > 0 && (
        <ul className="role-list">
          {roles.map((r) => (
            <li key={r.id} className={`card role-card ${r.isActive ? "role-card-active" : ""}`}>
              <div className="role-card-main">
                <h2 className="card-title">
                  {r.title} {r.isActive && <span className="active-badge">Active</span>}
                </h2>
                <p className="helper-text">
                  {LEVEL_LABELS[r.level]} · {r.skillCount} skills · {r.readiness == null ? "not rated yet" : `${r.readiness}% ready`}
                  {r.targetDate && ` · target ${new Date(r.targetDate).toLocaleDateString()}`}
                </p>
              </div>
              <div className="role-card-actions">
                {!r.isActive && (
                  <button type="button" className="btn btn-primary" onClick={() => run(() => rolesApi.activate(r.id), "Couldn't switch roles")}>
                    Make active
                  </button>
                )}
                <Link to={`/roles/${r.id}/skills`} className="btn btn-secondary">
                  Skills
                </Link>
                <Link to={`/roles/${r.id}/edit`} className="btn btn-secondary">
                  Edit<span className="visually-hidden"> {r.title}</span>
                </Link>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${r.title}"? Its skills, ratings and goals will be removed. Past interviews stay in History.`)) {
                      run(() => rolesApi.remove(r.id), "Couldn't delete the role");
                    }
                  }}
                >
                  Delete<span className="visually-hidden"> {r.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
