import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { rolesApi } from "../api/roles";
import { TopicPicker } from "../components/TopicPicker";
import { RoleHub } from "../components/RoleHub";
import { Difficulty, PRESET_TRACKS, RoleDetail, SessionListItem, Topic } from "../types";
import { HistoryList } from "../components/HistoryList";
import { OnboardingTour, TourStep } from "../components/OnboardingTour";
import { useAuth } from "../hooks/useAuth";
import { groupSessionsByDay } from "../utils/groupSessionsByDay";

const DIFFICULTIES: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="welcome"]',
    title: "Welcome to InterviewPal",
    body: "Here's a quick tour of how to set up a mock interview. It takes about 30 seconds, and you can skip it any time.",
  },
  {
    target: '[data-tour="role-hub"]',
    title: "Start with your target role",
    body: "Tell InterviewPal the job you want. It lists the skills that job needs, shows how ready you are, and plans what to practise each week.",
  },
  {
    target: '[data-tour="quick-practice"]',
    title: "Or just practise a topic",
    body: "Quick practice lets you pick any track and topic for a one-off interview. Here's how it works.",
  },
  {
    target: '[data-tour="track"]',
    title: "1. Choose a track",
    body: "This is the kind of role you're practising for. It decides which topics show up below.",
  },
  {
    target: '[data-tour="track-other"]',
    title: "Role not listed?",
    body: "Pick “Other” and type your own track, for example DevOps or Mobile Engineering.",
  },
  {
    target: '[data-tour="topic"]',
    title: "2. Pick a topic",
    body: "Tap a topic to focus the interview on it. The one you pick is highlighted. You need a topic before you can start.",
  },
  {
    target: '[data-tour="custom-topic"]',
    title: "Or add your own topic",
    body: "Type anything you want to practise, like “GraphQL” or “Designing a chat app”, then press Add. It's saved to this track and selected for you.",
  },
  {
    target: '[data-tour="difficulty"]',
    title: "3. Set the difficulty",
    body: "Junior, Intermediate, or Senior. Higher levels get harder questions and stricter grading.",
  },
  {
    target: '[data-tour="start"]',
    title: "4. Start the interview",
    body: "This button turns on once you've picked a topic. You'll get one question at a time: answer out loud with the mic, or type code for coding questions.",
  },
  {
    target: '[data-tour="history-nav"]',
    title: "Track your progress",
    body: "Every session is saved with its scores and feedback. Find past interviews under History.",
  },
  {
    target: '[data-tour="replay"]',
    title: "Need this again?",
    body: "Tap “Show me around” any time to replay this tour. Good luck!",
  },
];

function tourKey(userId: string) {
  return `onboarding-done:${userId}`;
}

function hasFinishedTour(userId: string) {
  try {
    return localStorage.getItem(tourKey(userId)) !== null;
  } catch {
    return false;
  }
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tourOpen, setTourOpen] = useState(false);
  const [track, setTrack] = useState<string>(PRESET_TRACKS[0]);
  const [customTrack, setCustomTrack] = useState("");
  const [usingOther, setUsingOther] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  // undefined while loading, null when no target role is set up
  const [activeRole, setActiveRole] = useState<RoleDetail | null | undefined>(undefined);

  const loadActiveRole = useCallback(() => {
    rolesApi
      .active()
      .then((res) => setActiveRole(res.active))
      .catch(() => setActiveRole(null));
  }, []);

  useEffect(loadActiveRole, [loadActiveRole]);

  const effectiveTrack = usingOther ? customTrack.trim() : track;

  useEffect(() => {
    api
      .get<{ sessions: SessionListItem[] }>("/sessions")
      .then((res) => {
        setRecentSessions(groupSessionsByDay(res.sessions)[0]?.sessions ?? []);
        // First-timers (no sessions yet, tour never finished) get the tour automatically.
        if (res.sessions.length === 0 && user && !hasFinishedTour(user.id)) setTourOpen(true);
      })
      .catch(() => setRecentSessions([]));
  }, [user]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    if (!user) return;
    try {
      localStorage.setItem(tourKey(user.id), "1");
    } catch {
      // storage unavailable — the tour may show again next visit
    }
  }, [user]);

  function selectTrack(value: string) {
    setUsingOther(false);
    setTrack(value);
    setTopic(null);
  }

  function selectOther() {
    setUsingOther(true);
    setTopic(null);
  }

  async function handleStart() {
    if (!topic || !effectiveTrack) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api.post<{ session: { id: string } }>("/sessions", {
        topicId: topic.id,
        track: effectiveTrack,
        difficulty,
      });
      navigate(`/sessions/${res.session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the session. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="page">
      {tourOpen && <OnboardingTour steps={TOUR_STEPS} onClose={closeTour} />}

      <div className="dashboard-heading">
        <div>
          <h1 className="page-title" data-tour="welcome">
            Your interview prep
          </h1>
          <p className="page-subtitle">Work towards a target role, or jump into a quick practice interview.</p>
        </div>
        <button type="button" className="btn-link btn-link-inline" data-tour="replay" onClick={() => setTourOpen(true)}>
          Show me around
        </button>
      </div>

      {activeRole !== undefined && <RoleHub detail={activeRole} onChanged={loadActiveRole} />}

      <section className="card" aria-labelledby="setup-title" data-tour="quick-practice">
        <h2 id="setup-title" className="card-title">
          Quick practice
        </h2>
        <p className="helper-text quick-practice-intro">A one-off interview on any track and topic. It doesn't change your role's skill ratings.</p>
        <div className="field">
          <span className="field-label" id="track-label">
            Track
          </span>
          <div className="segmented" role="group" aria-labelledby="track-label" data-tour="track">
            {PRESET_TRACKS.map((t) => (
              <button
                key={t}
                type="button"
                className={`segmented-option ${!usingOther && track === t ? "active" : ""}`}
                aria-pressed={!usingOther && track === t}
                onClick={() => selectTrack(t)}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              className={`segmented-option ${usingOther ? "active" : ""}`}
              aria-pressed={usingOther}
              onClick={selectOther}
              data-tour="track-other"
            >
              Other
            </button>
          </div>
          {usingOther && (
            <>
              <label htmlFor="custom-track" className="visually-hidden">
                Custom track name
              </label>
              <input
                id="custom-track"
                className="input"
                style={{ marginTop: 10 }}
                placeholder="e.g. DevOps, Mobile Engineering, Data Engineering…"
                value={customTrack}
                onChange={(e) => setCustomTrack(e.target.value)}
                autoFocus
              />
            </>
          )}
        </div>

        {effectiveTrack && (
          <div className="field" data-tour="topic">
            <span className="field-label" id="topic-label">
              Topic
            </span>
            <TopicPicker
              track={effectiveTrack}
              selectedTopicId={topic?.id ?? null}
              onSelect={setTopic}
              labelledBy="topic-label"
            />
          </div>
        )}

        <div className="field">
          <span className="field-label" id="difficulty-label">
            Difficulty
          </span>
          <div className="segmented" role="group" aria-labelledby="difficulty-label" data-tour="difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`segmented-option ${difficulty === d ? "active" : ""}`}
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <button
          className="btn btn-primary btn-block"
          disabled={!topic || !effectiveTrack || starting}
          onClick={handleStart}
          data-tour="start"
        >
          {starting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span className="visually-hidden">Starting interview…</span>
            </>
          ) : (
            "Start Interview"
          )}
        </button>
      </section>

      {recentSessions.length > 0 && (
        <section className="card" aria-labelledby="recent-title">
          <div className="session-header">
            <h2 id="recent-title" className="card-title" style={{ margin: 0 }}>
              Recent sessions
            </h2>
            <button className="btn btn-secondary" onClick={() => navigate("/history")}>
              View all
            </button>
          </div>
          <HistoryList
            sessions={recentSessions}
            onDelete={(id) => setRecentSessions((prev) => prev.filter((s) => s.id !== id))}
          />
        </section>
      )}
    </div>
  );
}
