import { FormEvent, useState } from "react";
import { ChildInput } from "../api";
import { avatarEmoji } from "../components/bits";
import { errorMessage } from "../errorMessage";
import { AVATARS, Avatar, Child } from "../types";

const AGES = Array.from({ length: 13 }, (_, i) => i + 5);

// Add or edit a learner: nickname, age and avatar.
export function ChildForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: Child; submitLabel: string; onSubmit: (input: ChildInput) => Promise<void>; onCancel?: () => void }) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [age, setAge] = useState(initial?.age ?? 11);
  const [avatar, setAvatar] = useState<Avatar>(initial?.avatar ?? "fox");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = initial ? `edit-${initial.id}` : "new-child";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ displayName: displayName.trim(), age, avatar });
      if (!initial) setDisplayName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="child-form" onSubmit={handleSubmit}>
      <div className="child-form-row">
        <div className="field">
          <label htmlFor={`${idBase}-name`}>Nickname</label>
          <input id={`${idBase}-name`} className="input" required maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-age`}>Age</label>
          <select id={`${idBase}-age`} className="input" value={age} onChange={(e) => setAge(Number(e.target.value))}>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="avatar-picker">
        <legend className="field-label">Avatar</legend>
        {AVATARS.map((a) => (
          <label key={a} className={`avatar-option ${avatar === a ? "selected" : ""}`}>
            <input type="radio" name={`${idBase}-avatar`} value={a} checked={avatar === a} onChange={() => setAvatar(a)} className="visually-hidden" />
            <span aria-hidden="true">{avatarEmoji(a)}</span>
            <span className="visually-hidden">{a}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="child-form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !displayName.trim()}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
