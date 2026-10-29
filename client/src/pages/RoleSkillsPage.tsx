import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { rolesApi } from "../api/roles";
import { RoleDetail, RoleSkill, SkillCategory } from "../types";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const CATEGORY_LABELS: Record<SkillCategory, string> = { TECHNICAL: "Technical", DOMAIN: "Domain knowledge", BEHAVIOURAL: "Behavioural" };
const IMPORTANCE_LABELS = ["", "Nice to have", "Important", "Core"];
const RATING_LABELS = ["", "New to it", "Basic", "Comfortable", "Strong", "Expert"];

// Rating history as a tiny line chart (1-5 scale). Decorative: the text beside it carries the numbers.
function Sparkline({ history }: { history: RoleSkill["history"] }) {
  if (history.length < 2) return null;
  const w = 120;
  const h = 28;
  const points = history.map((p, i) => `${(i / (history.length - 1)) * w},${h - ((p.rating - 1) / 4) * h}`).join(" ");
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 -2 ${w} ${h + 4}`} aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function RoleSkillsPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [newSkill, setNewSkill] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    rolesApi
      .get(id)
      .then((d) => {
        setDetail(d);
        // Saved ratings first, then anything clicked but not saved yet (dropping skills that were removed).
        setRatings((unsaved) => {
          const ids = new Set(d.skills.map((s) => s.id));
          const saved = Object.fromEntries(d.skills.filter((s) => s.selfRating != null).map((s) => [s.id, s.selfRating!]));
          return { ...saved, ...Object.fromEntries(Object.entries(unsaved).filter(([id]) => ids.has(id))) };
        });
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this role")));
  }, [id]);

  useEffect(load, [load]);

  async function saveRatings() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await rolesApi.rate(id, Object.entries(ratings).map(([skillId, rating]) => ({ skillId, rating })));
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your ratings"));
      setSaving(false);
    }
  }

  async function addSkill(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await rolesApi.addSkill(id, newSkill.trim());
      setNewSkill("");
      setStatus("Skill added.");
      load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add the skill"));
    }
  }

  async function removeSkill(skill: RoleSkill) {
    if (!window.confirm(`Remove "${skill.name}" and its rating history?`)) return;
    try {
      await rolesApi.removeSkill(id, skill.id);
      setStatus(`Removed ${skill.name}.`);
      load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove the skill"));
    }
  }

  if (!detail) {
    return (
      <div className="page">
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : (
          <p className="helper-text">Loading…</p>
        )}
      </div>
    );
  }

  const { role, skills } = detail;
  const isNew = params.get("new") === "1";
  const fromCv = skills.some((s) => s.selfRating != null && s.evidenceCount === 0 && s.rating == null);

  return (
    <div className="page">
      <Link to="/roles" className="btn-link btn-link-inline">
        ← Target roles
      </Link>
      <h1 className="page-title">{isNew ? `Rate yourself for ${role.title}` : `${role.title}: skills`}</h1>
      <p className="page-subtitle">
        Be honest: this is your starting point. Practice interviews then move each rating up or down based on how you actually answer.
        {fromCv && " Ratings already picked were suggested from your CV; change any that look wrong."}
      </p>

      <ul className="skill-list">
        {skills.map((s) => {
          const groupId = `rate-${s.id}`;
          return (
            <li key={s.id} className="card skill-card">
              <div className="skill-card-head">
                <div>
                  <h2 className="skill-card-title" id={`${groupId}-label`}>
                    {s.name}
                  </h2>
                  <p className="helper-text">
                    {CATEGORY_LABELS[s.category]} · {IMPORTANCE_LABELS[s.importance]}
                    {s.evidenceCount > 0 && ` · now ${s.rating?.toFixed(1)}/5 from ${s.evidenceCount} answer${s.evidenceCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <Sparkline history={s.history} />
              </div>
              {s.description && <p className="skill-desc">{s.description}</p>}
              <div className="segmented rating-group" role="group" aria-labelledby={`${groupId}-label`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`segmented-option ${ratings[s.id] === n ? "active" : ""}`}
                    aria-pressed={ratings[s.id] === n}
                    onClick={() => setRatings((r) => ({ ...r, [s.id]: n }))}
                  >
                    {n}
                    <span className="rating-word"> {RATING_LABELS[n]}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-link btn-link-inline skill-remove" onClick={() => removeSkill(s)}>
                Remove<span className="visually-hidden"> {s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <form className="card add-skill" onSubmit={addSkill}>
        <label htmlFor="new-skill">Missing a skill?</label>
        <div className="add-skill-row">
          <input id="new-skill" className="input" maxLength={60} placeholder="e.g. Kubernetes" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!newSkill.trim()}>
            Add
          </button>
        </div>
      </form>

      <p role="status" className="helper-text">
        {status}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="sticky-save">
        <button type="button" className="btn btn-primary" onClick={saveRatings} disabled={saving}>
          {saving ? "Saving…" : `Save ratings (${Object.keys(ratings).length} of ${skills.length})`}
        </button>
      </div>
    </div>
  );
}
