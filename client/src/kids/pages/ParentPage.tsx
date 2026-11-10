import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ChildInput, kidsApi, PinResetMethod } from "../api";
import { PinResetForm } from "../components/PinResetForm";
import { confirmNoPin, kidHomePath, kidsStarted, markKidsStarted, setKidLock } from "../kidMode";
import { useAuthConfig } from "../../hooks/useAuthConfig";
import { AvatarIcon, avatarEmoji } from "../components/bits";
import { ActivityChallenge, AVATARS, Avatar, Child, Course, CourseProgress } from "../types";

const AGES = Array.from({ length: 13 }, (_, i) => i + 5);

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function ChildForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: Child; submitLabel: string; onSubmit: (input: ChildInput) => Promise<void>; onCancel?: () => void }) {
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

function ChildCard({ child, courses, onChanged, onStart }: { child: Child; courses: Course[]; onChanged: () => void; onStart: (c: Child) => void }) {
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

function PinForm({ hasPin, resetMethod, onSaved }: { hasPin: boolean; resetMethod: PinResetMethod; onSaved: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    try {
      await kidsApi.setPin(pin, hasPin && currentPin ? currentPin : undefined);
      setPin("");
      setCurrentPin("");
      setStatus("PIN saved.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the PIN"));
    }
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  if (forgot) {
    return (
      <PinResetForm
        method={resetMethod}
        idPrefix="parent"
        onDone={() => {
          setForgot(false);
          setStatus("PIN reset.");
          onSaved();
        }}
      />
    );
  }

  return (
    <form className="pin-form" onSubmit={handleSubmit}>
      {hasPin && (
        <div className="field">
          <label htmlFor="current-pin">Current PIN</label>
          <input id="current-pin" className="input" type="password" inputMode="numeric" autoComplete="off" value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value))} />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-pin">{hasPin ? "New 4-digit PIN" : "Choose a 4-digit PIN"}</label>
        <input id="new-pin" className="input" type="password" inputMode="numeric" autoComplete="off" required value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pin.length !== 4}>
        {hasPin ? "Change PIN" : "Set PIN"}
      </button>
      {hasPin && (
        <button type="button" className="btn-link pin-forgot" onClick={() => setForgot(true)}>
          Forgot PIN?
        </button>
      )}
      <p role="status" className="helper-text">
        {status}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// "Getting started": three steps that tick off from what's actually set up, then shrinks to a "How it works" link.
// Also warns when the grown-up's email isn't confirmed, because Pal can't make challenges until it is.
function GettingStarted({ learners, hasPin, started, emailOk }: { learners: number; hasPin: boolean; started: boolean; emailOk: boolean }) {
  const steps = [
    { done: learners > 0, title: "Add a learner", body: "Just a nickname and age, under \"Add a learner\" below. Children don't need an account or an email." },
    { done: hasPin, title: "Set a kid-mode PIN", body: "Under \"Kid-mode PIN\". Without one, a child can leave kid mode and reach your InterviewPal account." },
    { done: started, title: "Start learning", body: "Press \"Start learning\" on your child's card. This browser then stays on their pages until you enter the PIN." },
  ];
  const allDone = steps.every((s) => s.done);
  return (
    <section aria-labelledby="getting-started-title" className="kids-card parent-section getting-started">
      <h2 id="getting-started-title" className="kids-section-title">
        {allDone ? "You're all set" : "Getting started"}
      </h2>
      {!emailOk && (
        <p className="kids-warning" role="note">
          Confirm your email first: Pal can't make challenges or answer questions until you do. Check your inbox, or <Link to="/account">resend the link</Link>.
        </p>
      )}
      {!allDone && (
        <ol className="setup-steps">
          {steps.map((s) => (
            <li key={s.title} className={s.done ? "is-done" : undefined}>
              <span className="setup-mark" aria-hidden="true">
                {s.done ? "✓" : ""}
              </span>
              <span>
                <strong>{s.title}</strong>
                {s.done && <span className="visually-hidden"> (done)</span>}
                <br />
                <span className="helper-text">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <details className="how-it-works" open={!allDone && learners === 0}>
        <summary>How it works</summary>
        <ul>
          <li>
            <strong>One course, 12 levels.</strong> Levels 1 to 4 use drag-and-drop blocks; from level 5 your child types real Python. Each level needs 3
            challenges passed to move up, and you can change the level any time with the dropdown on their card.
          </li>
          <li>
            <strong>Pal</strong> is the AI helper. It writes each challenge, checks your child's work (stars and a tip), and answers their questions with
            hints, not answers.
          </li>
          <li>
            <strong>Run vs check.</strong> "▶ Run" tries the program as often as they like and costs nothing. "I'm done, check it!" asks Pal to mark it.
          </li>
          <li>
            <strong>Kid mode</strong> locks this browser to your child's pages until you press "Grown-ups" and enter the PIN. It doesn't affect other
            devices. Forgot the PIN? Use "Forgot PIN?" and confirm with your password or Google.
          </li>
          <li>
            <strong>Keeping an eye on things:</strong> "Challenges &amp; chats" on each card shows every challenge and every question they asked Pal.
          </li>
          <li>
            <strong>Limits:</strong> Pal can help about 60 times a day (new challenges, checks and questions together), then asks them to come back
            tomorrow.
          </li>
        </ul>
      </details>
    </section>
  );
}

export function ParentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [resetMethod, setResetMethod] = useState<PinResetMethod>("password");
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { emailEnabled } = useAuthConfig();

  const load = useCallback(() => {
    Promise.all([kidsApi.listChildren(), kidsApi.listCourses()])
      .then(([kids, list]) => {
        setChildren(kids.children);
        setHasPin(kids.hasPin);
        setResetMethod(kids.pinResetMethod);
        setCourses(list.courses);
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load learners")));
  }, []);

  useEffect(load, [load]);

  function start(child: Child) {
    if (!confirmNoPin(hasPin)) return;
    if (user) {
      setKidLock(user.id, child.id);
      markKidsStarted(user.id);
    }
    navigate(kidHomePath(child.id));
  }

  return (
    <div className="kids-page parent-page">
      <h1 className="kids-title">Grown-ups area</h1>
      <p className="kids-subtitle">
        Add your children, choose how hard their challenges are, and see what they've been doing. Kids don't need their own account.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {children && <GettingStarted learners={children.length} hasPin={hasPin} started={!!user && kidsStarted(user.id)} emailOk={!emailEnabled || !!user?.emailVerified} />}

      <section aria-labelledby="learners-title" className="parent-section">
        <h2 id="learners-title" className="kids-section-title">
          Learners
        </h2>
        {!children && !error && <p className="helper-text">Loading…</p>}
        {children && children.length === 0 && <p className="helper-text">No learners yet. Add one below to get started.</p>}
        {children && children.length > 0 && (
          <ul className="child-list">
            {children.map((child) => (
              <ChildCard key={child.id} child={child} courses={courses} onChanged={load} onStart={start} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-title" className="kids-card parent-section">
        <h2 id="add-title" className="kids-section-title">
          Add a learner
        </h2>
        <ChildForm
          submitLabel="Add learner"
          onSubmit={async (input) => {
            await kidsApi.createChild(input);
            load();
          }}
        />
      </section>

      <section aria-labelledby="pin-title-parent" className="kids-card parent-section">
        <h2 id="pin-title-parent" className="kids-section-title">
          Kid-mode PIN
        </h2>
        <p className="helper-text">
          When a child starts learning, this device stays in kid mode. They can't reach InterviewPal or this page until a grown-up enters the PIN.
        </p>
        <PinForm hasPin={hasPin} resetMethod={resetMethod} onSaved={load} />
      </section>

      <section aria-labelledby="safety-title" className="parent-section parent-note">
        <h2 id="safety-title" className="kids-section-title">
          How Pal keeps it safe
        </h2>
        <ul>
          <li>Only a nickname and age are stored, under your account. Children never sign in or give an email.</li>
          <li>Pal is told to stay on coding, use simple words, never ask for personal details, and give hints instead of answers.</li>
          <li>Every question your child asks Pal is saved here under "Challenges & chats" for you to read.</li>
          <li>Questions are answered by the same AI service InterviewPal uses, so please supervise younger learners.</li>
        </ul>
      </section>
    </div>
  );
}
