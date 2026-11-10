import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import { storyApi } from "../api/story";
import { Framework } from "./types";

// One framework: when to use it, the steps, a fill-in template, an example and the usual mistake.
export function FrameworkBody({ framework, showUse = true }: { framework: Framework; showUse?: boolean }) {
  return (
    <>
      {showUse && <p className="helper-text">{framework.use}</p>}
      <ol className="feedback-list">
        {framework.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <h4 className="feedback-list-title">Fill in the brackets</h4>
      <p className="st-template">{framework.template}</p>
      <h4 className="feedback-list-title">Example</h4>
      <blockquote className="st-example">{framework.example}</blockquote>
      <p>
        <strong>Common mistake:</strong> {framework.mistake}
      </p>
    </>
  );
}

// /speak/frameworks: every cheat sheet on one page. #<key> opens and scrolls to one.
export function FrameworksPage() {
  const { hash } = useLocation();
  const [frameworks, setFrameworks] = useState<Framework[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storyApi
      .list()
      .then((res) => setFrameworks(res.frameworks))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the frameworks"));
  }, []);

  useEffect(() => {
    if (frameworks && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [frameworks, hash]);

  return (
    <div className="page">
      <p>
        <Link to="/speak">← Speak</Link>
      </p>
      <h1 className="page-title">Speaking frameworks</h1>
      <p className="page-subtitle">
        Short shapes for the answers you give most often. Pick one before you speak, and the listener can follow you without effort. Each story in Speak suggests the one
        that fits, and the marker scores structure against it.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!frameworks && !error && <p className="helper-text">Loading…</p>}
      {frameworks?.map((f) => (
        <details key={f.key} id={f.key} className="card st-framework" open={hash === `#${f.key}`}>
          <summary>
            <strong>{f.name}</strong>
            <span className="helper-text"> · {f.use}</span>
          </summary>
          <FrameworkBody framework={f} showUse={false} />
        </details>
      ))}
    </div>
  );
}
