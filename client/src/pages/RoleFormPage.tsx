import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { rolesApi } from "../api/roles";
import { Difficulty, LEVEL_LABELS } from "../types";

const LEVELS: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// Create (/roles/new) or edit (/roles/:id/edit) a target role.
export function RoleFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Difficulty>("INTERMEDIATE");
  const [targetDate, setTargetDate] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [cvSummary, setCvSummary] = useState("");
  const [isTechnical, setIsTechnical] = useState(true);
  const [original, setOriginal] = useState<{ jd: string; cv: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    rolesApi
      .get(id)
      .then(({ role }) => {
        setTitle(role.title);
        setLevel(role.level);
        setTargetDate(role.targetDate ? role.targetDate.slice(0, 10) : "");
        setJobDescription(role.jobDescription ?? "");
        setCvSummary(role.cvSummary ?? "");
        setIsTechnical(role.isTechnical);
        setOriginal({ jd: role.jobDescription ?? "", cv: role.cvSummary ?? "" });
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load this role")));
  }, [id]);

  const detailsChanged = editing && original != null && (original.jd !== jobDescription.trim() || original.cv !== cvSummary.trim());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input = {
      title: title.trim(),
      level,
      targetDate: targetDate || null,
      jobDescription: jobDescription.trim() || null,
      cvSummary: cvSummary.trim() || null,
    };
    try {
      if (editing) {
        await rolesApi.update(id!, { ...input, isTechnical });
        if (detailsChanged) await rolesApi.regenerateSkills(id!);
        navigate(`/roles/${id}/skills`);
      } else {
        const { role } = await rolesApi.create(input);
        navigate(`/roles/${role.id}/skills?new=1`);
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the role. Try again."));
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">{editing ? "Edit target role" : "Set your target role"}</h1>
      <p className="page-subtitle">Any job works. Only the title and level are required; the rest makes your skills list and questions sharper.</p>
      <form className="card role-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="role-title">Job title</label>
          <input
            id="role-title"
            className="input"
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. AI Engineer, Backend Developer, Product Manager"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label" id="role-level-label">
            Level
          </span>
          <div className="segmented" role="group" aria-labelledby="role-level-label">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`segmented-option ${level === l ? "active" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="role-date">Target date (optional)</label>
          <input id="role-date" type="date" className="input role-date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="role-jd">Job description (optional)</label>
          <textarea
            id="role-jd"
            className="input"
            rows={6}
            maxLength={8000}
            aria-describedby="role-privacy"
            placeholder="Paste the job ad you're aiming for"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="role-cv">Your CV or a summary of your experience (optional)</label>
          <textarea
            id="role-cv"
            className="input"
            rows={6}
            maxLength={8000}
            aria-describedby="role-privacy"
            placeholder="Paste your CV, or a few lines on what you've done so far"
            value={cvSummary}
            onChange={(e) => setCvSummary(e.target.value)}
          />
        </div>
        <p id="role-privacy" className="helper-text privacy-note">
          What you paste is saved to your account and sent to the AI service that writes your questions. You can edit or delete it any time, and
          deleting your account removes it.
        </p>
        {editing && (
          <label className="checkbox-row">
            <input type="checkbox" checked={isTechnical} onChange={(e) => setIsTechnical(e.target.checked)} />
            Interviews for this role include writing code
          </label>
        )}
        {detailsChanged && <p className="helper-text">Saving will refresh your skills list from the new details. Your ratings are kept.</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? (editing ? "Saving…" : "Building your skills list…") : editing ? "Save" : "Create role"}
        </button>
      </form>
    </div>
  );
}
