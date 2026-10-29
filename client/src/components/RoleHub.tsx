import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { rolesApi } from "../api/roles";
import { learnApi } from "../api/learn";
import { LEVEL_LABELS, Persona, RoleDetail, RoleSkill } from "../types";
import { PersonaPicker } from "./PersonaPicker";

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function Delta({ now, before, unit = "" }: { now: number | null; before: number | null; unit?: string }) {
  if (now == null || before == null) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span className={`delta ${up ? "delta-up" : "delta-down"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="visually-hidden">{up ? "up" : "down"}</span> {Math.abs(diff)}
      {unit} this week
    </span>
  );
}

export function SkillBar({ skill }: { skill: RoleSkill }) {
  const label = skill.rating == null ? "Not rated yet" : `${skill.rating.toFixed(1)} out of 5`;
  return (
    <div className="skill-bar-row">
      <div className="skill-bar-head">
        <span className="skill-name">{skill.name}</span>
        <span className="skill-value">
          {skill.rating == null ? "Unrated" : skill.rating.toFixed(1)} <Delta now={skill.rating} before={skill.ratingWeekAgo} />
        </span>
      </div>
      <div className="skill-bar" role="img" aria-label={`${skill.name}: ${label}`}>
        <span style={{ width: `${((skill.rating ?? 0) / 5) * 100}%` }} />
      </div>
    </div>
  );
}

// The home page's top card: the active target role's readiness, weakest skills and this week's plan.
export function RoleHub({ detail, onChanged }: { detail: RoleDetail | null; onChanged: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"practice" | "mock" | "plan" | "learn" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona>("NEUTRAL");
  // Ticks show immediately; the server copy catches up on the next reload.
  const [goalOverrides, setGoalOverrides] = useState<Record<string, boolean>>({});

  if (!detail) {
    return (
      <section className="card role-hub role-hub-empty" aria-labelledby="role-hub-title" data-tour="role-hub">
        <h2 id="role-hub-title" className="card-title">
          What job are you working towards?
        </h2>
        <p className="helper-text">
          Set a target role (any job, from AI Engineer to nurse) and InterviewPal will list the skills it needs, track how ready you are, and plan
          what to practise each week. Pasting the job description and your CV makes it sharper, but it's optional.
        </p>
        <Link to="/roles/new" className="btn btn-primary">
          Set my target role
        </Link>
      </section>
    );
  }

  const { role, skills, readiness, readinessChange } = detail;
  const goals = detail.goals.map((g) => (g.id in goalOverrides ? { ...g, done: goalOverrides[g.id] } : g));
  // Same order the server uses to pick the weakest skill (lowest rating, unrated first, then most important).
  const weakest = [...skills].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0) || b.importance - a.importance).slice(0, 5);
  const unrated = skills.filter((s) => s.rating == null).length;
  const done = goals.filter((g) => g.done).length;

  async function practice(skillId?: string) {
    setBusy("practice");
    setError(null);
    try {
      const { session } = await rolesApi.practice(role.id, skillId, persona);
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't start practice. Try again."));
      setBusy(null);
    }
  }

  // Opens the skill's "Learn this" course, creating it the first time.
  async function learn(skillId: string) {
    setBusy("learn");
    setError(null);
    try {
      const { course } = await learnApi.openForSkill(skillId);
      navigate(`/learn/courses/${course.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't open the course. Try again."));
      setBusy(null);
    }
  }

  async function startMock() {
    setBusy("mock");
    setError(null);
    try {
      const { session } = await rolesApi.mock(role.id, persona);
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the mock interview. Try again."));
      setBusy(null);
    }
  }

  async function planWeek() {
    setBusy("plan");
    setError(null);
    try {
      await rolesApi.planWeek(role.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Couldn't plan your week. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function toggleGoal(goalId: string, value: boolean) {
    setGoalOverrides((o) => ({ ...o, [goalId]: value }));
    try {
      await rolesApi.setGoalDone(role.id, goalId, value);
    } catch (err) {
      setGoalOverrides((o) => ({ ...o, [goalId]: !value }));
      setError(errorMessage(err, "Couldn't update that goal."));
    }
  }

  return (
    <section className="card role-hub" aria-labelledby="role-hub-title" data-tour="role-hub">
      <div className="role-hub-head">
        <div>
          <p className="role-hub-eyebrow">Target role</p>
          <h2 id="role-hub-title" className="role-hub-title">
            {role.title}
          </h2>
          <p className="helper-text role-hub-meta">
            {LEVEL_LABELS[role.level]}
            {role.targetDate && ` · ${daysUntil(role.targetDate) >= 0 ? `${daysUntil(role.targetDate)} days to go` : "target date passed"}`}
            {" · "}
            <Link to="/roles">Change or add roles</Link>
          </p>
        </div>
        <div className="readiness" aria-live="polite">
          <span className="readiness-value">{readiness == null ? "–" : `${readiness}%`}</span>
          <span className="readiness-label">ready</span>
          <Delta now={readinessChange} before={readinessChange == null ? null : 0} unit="%" />
        </div>
      </div>

      {unrated > 0 && (
        <p className="role-hub-note">
          {unrated === skills.length ? "Rate yourself on each skill to see how ready you are." : `${unrated} skills aren't rated yet.`}{" "}
          <Link to={`/roles/${role.id}/skills`}>Rate my skills</Link>
        </p>
      )}

      <PersonaPicker value={persona} onChange={setPersona} idPrefix="hub" />

      <div className="role-hub-actions">
        <button type="button" className="btn btn-primary" onClick={() => practice()} disabled={busy !== null}>
          {busy === "practice" ? "Starting…" : "Practise my weakest skill"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={startMock} disabled={busy !== null}>
          {busy === "mock" ? "Starting…" : "Full mock interview"}
        </button>
      </div>

      <div className="role-hub-grid">
        <div>
          <h3 className="role-hub-subtitle">Weakest skills</h3>
          {weakest.map((s) => (
            <div key={s.id} className="skill-row">
              <SkillBar skill={s} />
              <button type="button" className="btn-link btn-link-inline" onClick={() => learn(s.id)} disabled={busy !== null}>
                Learn<span className="visually-hidden"> {s.name}</span>
              </button>
              <button type="button" className="btn-link btn-link-inline" onClick={() => practice(s.id)} disabled={busy !== null}>
                Practise<span className="visually-hidden"> {s.name}</span>
              </button>
            </div>
          ))}
          <Link to={`/roles/${role.id}/skills`} className="role-hub-more">
            All {skills.length} skills and history
          </Link>
        </div>

        <div>
          <h3 className="role-hub-subtitle">
            This week's plan{goals.length > 0 && <span className="helper-text"> · {done} of {goals.length} done</span>}
          </h3>
          {goals.length === 0 ? (
            <p className="helper-text">Get three small, concrete goals aimed at your weakest skills.</p>
          ) : (
            <ul className="goal-list">
              {goals.map((g) => (
                <li key={g.id}>
                  <label className={`goal ${g.done ? "goal-done" : ""}`}>
                    <input type="checkbox" checked={g.done} onChange={(e) => toggleGoal(g.id, e.target.checked)} />
                    <span>{g.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-secondary" onClick={planWeek} disabled={busy !== null}>
            {busy === "plan" ? "Planning…" : goals.length ? "Re-plan unfinished goals" : "Plan my week"}
          </button>
        </div>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
