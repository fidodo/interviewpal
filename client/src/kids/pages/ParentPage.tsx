import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAuthConfig } from "../../hooks/useAuthConfig";
import { kidsApi, PinResetMethod } from "../api";
import { confirmNoPin, kidHomePath, kidsStarted, markKidsStarted, setKidLock } from "../kidMode";
import { errorMessage } from "../errorMessage";
import { Child, Course } from "../types";
import { ChildCard } from "../parent/ChildCard";
import { ChildForm } from "../parent/ChildForm";
import { GettingStarted } from "../parent/GettingStarted";
import { PinForm } from "../parent/PinForm";

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
