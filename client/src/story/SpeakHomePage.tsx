import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { storyApi } from "../api/story";
import { errorMessage, minutes } from "./speakUtils";
import { CONVERSATION_SCENARIOS, DrillInfo, DrillKind, KIND_LABELS, STORY_KINDS, StoryKind, StorySummary, TARGETS } from "./types";

// /speak: start a story (type, optional topic and audience, length) and see past ones.
export function SpeakHomePage() {
  const navigate = useNavigate();
  // ?kind=&topic= prefill the form (from the story bank: "practise one", "tell it now").
  const [params] = useSearchParams();
  const [kind, setKind] = useState<StoryKind>(() => (STORY_KINDS.some((k) => k.kind === params.get("kind")) ? (params.get("kind") as StoryKind) : "EXPERIENCE"));
  const [topic, setTopic] = useState(() => (params.get("topic") ?? "").slice(0, 200));
  const [audience, setAudience] = useState("");
  const [target, setTarget] = useState<number>(120);
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  const [drills, setDrills] = useState<DrillInfo[]>([]);
  const [maxTakes, setMaxTakes] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [startingDrill, setStartingDrill] = useState<DrillKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?drill= from the Today card: that drill is marked "Suggested for you".
  const suggested = params.get("drill");

  useEffect(() => {
    storyApi
      .list()
      .then((res) => {
        setStories(res.stories);
        setDrills(res.drills);
        setMaxTakes(res.maxTakes);
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load your stories")));
  }, []);

  async function startDrill(kind: DrillKind) {
    setStartingDrill(kind);
    setError(null);
    try {
      const { story } = await storyApi.createDrill(kind);
      navigate(`/speak/${story.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the drill. Try again."));
      setStartingDrill(null);
    }
  }

  const drillKinds = new Set<string>(drills.map((d) => d.kind));
  const storyList = stories?.filter((s) => !drillKinds.has(s.kind)) ?? null;
  const recentDrills = stories?.filter((s) => drillKinds.has(s.kind)).slice(0, 5) ?? [];

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if ((kind === "OWN" || kind === "CONVERSATION") && !topic.trim()) {
      setError(kind === "OWN" ? "Type the topic you want to talk about." : "Pick a conversation, or describe your own.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { story } = await storyApi.create({ kind, topic: topic.trim() || null, audience: audience.trim() || null, targetSeconds: target });
      navigate(`/speak/${story.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't set up the story. Try again."));
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Speak</h1>
      <p className="page-subtitle">
        Practise telling a story or explaining a topic out loud. Get marked on structure, clarity, specifics, how you came across and delivery, see a stronger version of
        your own story, then retell it and watch the scores move.
      </p>
      <p className="bank-callout">
        <Link to="/speak/bank">Your story bank</Link>: keep your best stories, see which competencies have no story yet, and practise picking the right one for a question.
      </p>
      <p className="bank-callout">
        <Link to="/speak/frameworks">Speaking frameworks</Link>: STAR, PREP, answer first and other shapes, each with a fill-in template and an example.
      </p>

      {drills.length > 0 && (
        <section id="drills" className="card st-drills" aria-labelledby="st-drills-title">
          <h2 id="st-drills-title" className="card-title">
            1-minute drills
          </h2>
          <p className="helper-text">One skill at a time, on a ready-made prompt. Up to {maxTakes} takes each, so you can try it again straight away.</p>
          <ul className="st-drill-list">
            {drills.map((d) => (
              <li key={d.kind}>
                <button type="button" className={`st-kind ${suggested === d.kind ? "active" : ""}`} onClick={() => startDrill(d.kind)} disabled={startingDrill !== null}>
                  <span className="st-kind-title">
                    {d.label}
                    {suggested === d.kind && <span className="st-banked">Suggested for you</span>}
                  </span>
                  <span className="helper-text">{d.description}</span>
                  <span className="helper-text">
                    {d.targetSeconds} seconds · trains {d.focus}
                    {startingDrill === d.kind && " · starting…"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {recentDrills.length > 0 && (
            <p className="helper-text">
              Recent drills:{" "}
              {recentDrills.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && " · "}
                  <Link to={`/speak/${s.id}`}>
                    {KIND_LABELS[s.kind].replace(/^Drill: /, "")} ({s.takes === 0 ? "not done" : `best ${s.bestScore}/10`})
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      <form className="card" onSubmit={handleCreate}>
        <fieldset className="st-kinds">
          <legend className="field-label">What do you want to practise?</legend>
          {STORY_KINDS.map((k) => (
            <button key={k.kind} type="button" className={`st-kind ${kind === k.kind ? "active" : ""}`} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              <span className="st-kind-title">{k.label}</span>
              <span className="helper-text">{k.description}</span>
            </button>
          ))}
        </fieldset>
        {kind === "CONVERSATION" && (
          <div className="field">
            <span className="field-label" id="st-scenario-label">
              Who are you talking to?
            </span>
            <div className="segmented" role="group" aria-labelledby="st-scenario-label">
              {CONVERSATION_SCENARIOS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`segmented-option ${topic === c.topic ? "active" : ""}`}
                  aria-pressed={topic === c.topic}
                  onClick={() => {
                    setTopic(c.topic);
                    setAudience(c.audience);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="helper-text">Or describe your own conversation and who it's with below. The AI replies to what you actually say.</p>
          </div>
        )}
        <div className="field">
          <label htmlFor="st-topic">{kind === "OWN" ? "Your topic" : kind === "CONVERSATION" ? "The conversation" : "Topic (optional)"}</label>
          <input
            id="st-topic"
            className="input"
            maxLength={200}
            required={kind === "OWN" || kind === "CONVERSATION"}
            placeholder={
              kind === "EXPERIENCE"
                ? "e.g. a conflict with a teammate, a project that failed. Leave blank for a surprise."
                : kind === "OWN"
                  ? "e.g. why I'm moving from full-stack into AI engineering"
                  : kind === "CONVERSATION"
                    ? "e.g. asking my manager for a raise, a coffee chat with a recruiter"
                    : "e.g. how RAG works, why we should adopt TypeScript. Leave blank for a surprise."
            }
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="st-audience">{kind === "CONVERSATION" ? "Who they are (optional)" : "Audience (optional)"}</label>
          <input
            id="st-audience"
            className="input"
            maxLength={100}
            placeholder="e.g. a hiring manager, a product manager, a new teammate"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label" id="st-length-label">
            How long to speak
          </span>
          <div className="segmented" role="group" aria-labelledby="st-length-label">
            {TARGETS.map((t) => (
              <button key={t} type="button" className={`segmented-option ${target === t ? "active" : ""}`} aria-pressed={target === t} onClick={() => setTarget(t)}>
                {minutes(t)}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Setting up your prompt…" : "Give me a prompt"}
        </button>
      </form>

      <section aria-labelledby="st-history-title">
        <h2 id="st-history-title" className="card-title">
          Your stories
        </h2>
        {!storyList && !error && <p className="helper-text">Loading…</p>}
        {storyList?.length === 0 && <p className="helper-text">None yet.</p>}
        {storyList && storyList.length > 0 && (
          <p className="helper-text">Practice stories are cleared 90 days after your last take, and prompts you never tell after 7 days, unless you save them to your story bank.</p>
        )}
        {storyList && storyList.length > 0 && (
          <ul className="course-list">
            {storyList.map((s) => (
              <li key={s.id}>
                <Link to={`/speak/${s.id}`} className="card course-item">
                  <span className="course-item-title">{s.prompt}</span>
                  <span className="helper-text">
                    {KIND_LABELS[s.kind]} · {minutes(s.targetSeconds)} ·{" "}
                    {s.round > 1 && `Round ${s.round} · `}
                    {s.takes === 0 ? "not told yet" : `${s.takes} take${s.takes === 1 ? "" : "s"}, best ${s.bestScore}/10`}
                  </span>
                  {s.banked && <span className="st-banked">Saved to story bank</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
