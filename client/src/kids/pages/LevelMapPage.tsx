import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { kidsApi } from "../api";
import { Stars } from "../components/bits";
import { CourseProgress, LevelProgress } from "../types";

function levelState(level: LevelProgress, current: number) {
  if (level.order < current) return "done";
  if (level.order === current) return "current";
  return "locked";
}

export function LevelMapPage() {
  const { childId, slug } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!childId || !slug) return;
    kidsApi
      .progress(childId, slug)
      .then(setProgress)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this course"));
  }, [childId, slug]);

  async function play() {
    if (!progress || !childId || !slug) return;
    if (progress.openChallengeId) {
      navigate(`/kids/challenge/${progress.openChallengeId}`);
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const { challenge } = await kidsApi.nextChallenge(childId, slug);
      navigate(`/kids/challenge/${challenge.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pal couldn't make a challenge. Try again.");
      setStarting(false);
    }
  }

  return (
    <div className="kids-page">
      <Link to={`/kids/learn/${childId}`} className="btn-link kids-back">
        ← All courses
      </Link>
      {progress && (
        <>
          <h1 className="kids-title">{progress.course.title}</h1>
          <p className="kids-subtitle">{progress.course.description}</p>
        </>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!progress && !error && <p className="helper-text">Loading…</p>}
      {progress && (
        <ol className="level-path" aria-label="Levels">
          {progress.levels.map((level) => {
            const state = levelState(level, progress.enrollment.currentLevel);
            return (
              <li key={level.order} className={`level-node level-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="level-number" aria-hidden="true">
                  {state === "locked" ? "🔒" : level.order}
                </span>
                <div className="level-info">
                  <h2 className="level-title">
                    <span className="visually-hidden">Level {level.order}: </span>
                    {level.title}
                  </h2>
                  <p className="level-meta">
                    <span className={`editor-badge editor-${level.editor.toLowerCase()}`}>{level.editor === "BLOCKS" ? "Blocks" : "Python"}</span>
                    {state === "done" && <Stars count={Math.min(3, Math.round(level.stars / Math.max(1, level.passedCount)))} label={`${level.stars} stars earned`} />}
                    {state === "current" && (
                      <span>
                        {Math.min(progress.enrollment.passedAtLevel, level.challengesToPass)} of {level.challengesToPass} challenges done
                      </span>
                    )}
                    {state === "locked" && <span className="visually-hidden">Locked</span>}
                  </p>
                  {state === "current" && (
                    <div className="level-progress" aria-hidden="true">
                      <span style={{ width: `${Math.min(1, progress.enrollment.passedAtLevel / level.challengesToPass) * 100}%` }} />
                    </div>
                  )}
                </div>
                {state === "current" && (
                  <button type="button" className="btn btn-primary kids-play" onClick={play} disabled={starting}>
                    {starting ? "Pal is making your challenge…" : progress.openChallengeId ? "Keep going" : "Play"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
