import { useCallback, useEffect, useState } from "react";
import { kidsApi } from "../api";
import { AvatarIcon } from "../components/bits";
import { errorMessage } from "../errorMessage";
import { ActivityChallenge, Child, Course, CourseProgress } from "../types";
import { ChildForm } from "./ChildForm";

// "Challenges & chats": every challenge the learner tried, and everything they asked Pal.
function Activity({ childId }: { childId: string }) {
  const [items, setItems] = useState<ActivityChallenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kidsApi
      .activity(childId)
      .then((res) => setItems(res.challenges))
      .catch((err) => setError(errorMessage(err, "Couldn't load activity")));
  }, [childId]);

  if (error)
    return (
      <p className="error-text" role="alert">
        {error}
      </p>
    );
  if (!items) return <p className="helper-text">Loading…</p>;
  if (items.length === 0) return <p className="helper-text">No challenges yet.</p>;
  return (
    <ul className="activity-list">
      {items.map((c) => (
        <li key={c.id} className="activity-item">
          <p className="activity-head">
            <strong>{c.title}</strong> · Level {c.levelOrder} · {c.status === "PASSED" ? "Passed ✓" : "In progress"} · {c.attempts.length} check
            {c.attempts.length === 1 ? "" : "s"} · {new Date(c.createdAt).toLocaleDateString()}
          </p>
          {c.messages.length > 0 && (
            <ul className="activity-chat" aria-label={`Chat with Pal about ${c.title}`}>
              {c.messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.role === "PAL" ? "Pal" : "Learner"}:</strong> {m.text}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// One learner on the Grown-ups page: start learning, level per course, activity, edit and remove.
export function ChildCard({ child, courses, onChanged, onStart }: { child: Child; courses: Course[]; onChanged: () => void; onStart: (c: Child) => void }) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState<Record<string, CourseProgress>>({});
  const [showActivity, setShowActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(() => {
    Promise.all(courses.map((c) => kidsApi.progress(child.id, c.slug)))
      .then((list) => setProgress(Object.fromEntries(list.map((p) => [p.course.slug, p]))))
      .catch((err) => setError(errorMessage(err, "Couldn't load progress")));
  }, [child.id, courses]);

  useEffect(loadProgress, [loadProgress]);

  async function changeLevel(slug: string, level: number) {
    setError(null);
    try {
      await kidsApi.setLevel(child.id, slug, level);
      loadProgress();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the level"));
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${child.displayName}? Their progress and chats will be deleted.`)) return;
    try {
      await kidsApi.deleteChild(child.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove learner"));
    }
  }

  return (
    <li className="kids-card child-card">
      <div className="child-card-head">
        <AvatarIcon avatar={child.avatar} size="lg" />
        <div>
          <h3 className="child-name">{child.displayName}</h3>
          <p className="helper-text">Age {child.age}</p>
        </div>
        <button type="button" className="btn btn-primary child-start" onClick={() => onStart(child)}>
          Start learning
        </button>
      </div>

      {editing ? (
        <ChildForm
          initial={child}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await kidsApi.updateChild(child.id, input);
            setEditing(false);
            onChanged();
          }}
        />
      ) : (
        <>
          {courses.map((course) => {
            const p = progress[course.slug];
            const selectId = `level-${child.id}-${course.slug}`;
            return (
              <div key={course.slug} className="child-course">
                <label htmlFor={selectId} className="field-label">
                  {course.title} level
                </label>
                <select
                  id={selectId}
                  className="input"
                  value={p?.enrollment.currentLevel ?? 1}
                  disabled={!p}
                  onChange={(e) => changeLevel(course.slug, Number(e.target.value))}
                >
                  {(p?.levels ?? []).map((l) => (
                    <option key={l.order} value={l.order}>
                      {l.order}. {l.title} ({l.editor === "BLOCKS" ? "blocks" : "Python"})
                    </option>
                  ))}
                </select>
                {p && (
                  <p className="helper-text">
                    {p.enrollment.passedAtLevel} of {p.levels.find((l) => l.order === p.enrollment.currentLevel)?.challengesToPass ?? 3} challenges done at this
                    level. Moves up automatically, or pick a level here.
                  </p>
                )}
              </div>
            );
          })}
          <div className="child-card-actions">
            <button type="button" className="btn btn-secondary" aria-expanded={showActivity} onClick={() => setShowActivity((v) => !v)}>
              {showActivity ? "Hide activity" : "Challenges & chats"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              Remove
            </button>
          </div>
          {showActivity && <Activity childId={child.id} />}
        </>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
