import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { TopicPicker } from "../components/TopicPicker";
import { Difficulty, PRESET_TRACKS, SessionListItem, Topic } from "../types";
import { HistoryList } from "../components/HistoryList";

const DIFFICULTIES: Difficulty[] = ["JUNIOR", "INTERMEDIATE", "SENIOR"];

export function DashboardPage() {
  const navigate = useNavigate();
  const [track, setTrack] = useState<string>(PRESET_TRACKS[0]);
  const [customTrack, setCustomTrack] = useState("");
  const [usingOther, setUsingOther] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);

  const effectiveTrack = usingOther ? customTrack.trim() : track;

  useEffect(() => {
    api
      .get<{ sessions: SessionListItem[] }>("/sessions")
      .then((res) => setRecentSessions(res.sessions.slice(0, 3)))
      .catch(() => setRecentSessions([]));
  }, []);

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
      <h1 className="page-title">Start a mock interview</h1>
      <p className="page-subtitle">Pick a track, a topic, and how hard you want it to be.</p>

      <div className="card">
        <div className="field">
          <label>Track</label>
          <div className="segmented">
            {PRESET_TRACKS.map((t) => (
              <button
                key={t}
                type="button"
                className={`segmented-option ${!usingOther && track === t ? "active" : ""}`}
                onClick={() => selectTrack(t)}
              >
                {t}
              </button>
            ))}
            <button type="button" className={`segmented-option ${usingOther ? "active" : ""}`} onClick={selectOther}>
              Other
            </button>
          </div>
          {usingOther && (
            <input
              className="input"
              style={{ marginTop: 10 }}
              placeholder="e.g. DevOps, Mobile Engineering, Data Engineering…"
              value={customTrack}
              onChange={(e) => setCustomTrack(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {effectiveTrack && (
          <div className="field">
            <label>Topic</label>
            <TopicPicker track={effectiveTrack} selectedTopicId={topic?.id ?? null} onSelect={setTopic} />
          </div>
        )}

        <div className="field">
          <label>Difficulty</label>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`segmented-option ${difficulty === d ? "active" : ""}`}
                onClick={() => setDifficulty(d)}
              >
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <button
          className="btn btn-primary btn-block"
          disabled={!topic || !effectiveTrack || starting}
          onClick={handleStart}
        >
          {starting ? <span className="spinner" /> : "Start Interview"}
        </button>
      </div>

      {recentSessions.length > 0 && (
        <div className="card">
          <div className="session-header">
            <h2 style={{ margin: 0, fontSize: 16 }}>Recent sessions</h2>
            <button className="btn btn-secondary" onClick={() => navigate("/history")}>
              View all
            </button>
          </div>
          <HistoryList sessions={recentSessions} />
        </div>
      )}
    </div>
  );
}
