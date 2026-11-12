import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { raglabApi } from "../api/raglab";
import { LANGUAGE_LABELS, LabLanguage, ProjectSummary } from "./types";

import { errorMessage } from "./ragLabUtils";
import { LevelPath, useLevels } from "./LevelPath";

// /rag-lab: what the lab is, your bots, and starting a new one.
export function RagLabHomePage() {
  const navigate = useNavigate();
  const { levels, error: levelsError } = useLevels();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("My RAG bot");
  const [language, setLanguage] = useState<LabLanguage>("typescript");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    raglabApi
      .projects()
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(errorMessage(err, "Couldn't load your bots")));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { project } = await raglabApi.createProject(name.trim(), language);
      navigate(`/rag-lab/${project.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the project"));
      setCreating(false);
    }
  }

  const levelTitle = (n: number) => levels?.levels.find((l) => l.number === n)?.title;

  return (
    <div className="page page-wide">
      <h1 className="page-title">RAG Lab</h1>
      <p className="page-subtitle">
        Build one retrieval-augmented chatbot, level by level, from naive RAG to production grade. Each level adds requirements to the same bot; it's tested on
        questions it has never seen, and every earlier level's checks keep running.
      </p>
      {levels && !levels.embeddingsEnabled && (
        <p className="error-text" role="alert">
          Embeddings aren't set up on this server, so bots can't run yet.
        </p>
      )}

      <section className="card" aria-labelledby="rl-projects-title">
        <h2 id="rl-projects-title" className="card-title">
          Your bots
        </h2>
        {!projects && !error && <p className="helper-text">Loading…</p>}
        {projects?.length === 0 && <p className="helper-text">None yet. Start one below.</p>}
        {projects && projects.length > 0 && (
          <ul className="course-list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link to={`/rag-lab/${p.id}`} className="card course-item">
                  <span className="course-item-title">{p.name}</span>
                  <span className="helper-text">
                    {LANGUAGE_LABELS[p.language]} · Level {p.level}
                    {levelTitle(p.level) ? `: ${levelTitle(p.level)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="rl-create">
          <h3 className="dg-panel-title">Start a new bot</h3>
          <div className="field">
            <label htmlFor="rl-name">Name</label>
            <input id="rl-name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <span className="field-label" id="rl-language-label">
              Language
            </span>
            <div className="segmented" role="group" aria-labelledby="rl-language-label">
              {(Object.keys(LANGUAGE_LABELS) as LabLanguage[]).map((l) => (
                <button key={l} type="button" className={`segmented-option ${language === l ? "active" : ""}`} aria-pressed={language === l} onClick={() => setLanguage(l)}>
                  {LANGUAGE_LABELS[l]}
                </button>
              ))}
            </div>
            <p className="helper-text">Runs in your browser. Python comes with numpy; TypeScript is type-stripped, not type-checked.</p>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()}>
            {creating ? "Creating…" : "Create bot"}
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="rl-levels-title">
        <h2 id="rl-levels-title" className="card-title">
          The levels
        </h2>
        {levelsError && (
          <p className="error-text" role="alert">
            {levelsError}
          </p>
        )}
        {levels && <LevelPath levels={levels.levels} />}
      </section>
    </div>
  );
}
