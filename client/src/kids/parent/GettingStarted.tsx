import { Link } from "react-router-dom";

// "Getting started": three steps that tick off from what's actually set up, then shrinks to a "How it works" link.
// Also warns when the grown-up's email isn't confirmed, because Pal can't make challenges until it is.
export function GettingStarted({ learners, hasPin, started, emailOk }: { learners: number; hasPin: boolean; started: boolean; emailOk: boolean }) {
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
