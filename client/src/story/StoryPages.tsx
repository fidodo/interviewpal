import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { storyApi } from "../api/story";
import { MicButton } from "../components/MicButton";
import { MicTestButton } from "../components/MicTestButton";
import { ScoreBadge } from "../components/ScoreBadge";
import { TranscriptBox } from "../components/TranscriptBox";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { DIMENSIONS, KIND_LABELS, STORY_KINDS, Story, StoryKind, StorySummary, StoryTake, TARGETS } from "./types";

const PLAN_SECONDS = 60;
// Below this, the recording is treated as missing and the take as typed (no pace is measured).
const MIN_TIMED_SECONDS = 5;
const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const minutes = (s: number) => `${s / 60} min`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// /speak: start a story (type, optional topic and audience, length) and see past ones.
export function SpeakHomePage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<StoryKind>("EXPERIENCE");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [target, setTarget] = useState<number>(120);
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storyApi
      .list()
      .then((res) => setStories(res.stories))
      .catch((err) => setError(errorMessage(err, "Couldn't load your stories")));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (kind === "OWN" && !topic.trim()) {
      setError("Type the topic you want to talk about.");
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
        <div className="field">
          <label htmlFor="st-topic">{kind === "OWN" ? "Your topic" : "Topic (optional)"}</label>
          <input
            id="st-topic"
            className="input"
            maxLength={200}
            required={kind === "OWN"}
            placeholder={
              kind === "EXPERIENCE"
                ? "e.g. a conflict with a teammate, a project that failed. Leave blank for a surprise."
                : kind === "OWN"
                  ? "e.g. why I'm moving from full-stack into AI engineering"
                  : "e.g. how RAG works, why we should adopt TypeScript. Leave blank for a surprise."
            }
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="st-audience">Audience (optional)</label>
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
        {!stories && !error && <p className="helper-text">Loading…</p>}
        {stories?.length === 0 && <p className="helper-text">None yet.</p>}
        {stories && stories.length > 0 && (
          <ul className="course-list">
            {stories.map((s) => (
              <li key={s.id}>
                <Link to={`/speak/${s.id}`} className="card course-item">
                  <span className="course-item-title">{s.prompt}</span>
                  <span className="helper-text">
                    {KIND_LABELS[s.kind]} · {minutes(s.targetSeconds)} ·{" "}
                    {s.takes === 0 ? "not told yet" : `${s.takes} take${s.takes === 1 ? "" : "s"}, best ${s.bestScore}/10`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

function delta(now: number, before: number | undefined) {
  if (before === undefined) return null;
  const d = now - before;
  return d === 0 ? "no change" : d > 0 ? `up ${d}` : `down ${-d}`;
}

function TakeResult({ take, previous, targetSeconds }: { take: StoryTake; previous?: StoryTake; targetSeconds: number }) {
  const { stats } = take;
  const hedges = Object.entries(stats.hedges.phrases);
  return (
    <>
      <div className="debug-result-head">
        <ScoreBadge score={take.score} />
        <div>
          <h3 className="feedback-title">
            Take {take.number} scored {take.score}/10
          </h3>
          {previous && <p className="helper-text">Take {previous.number} scored {previous.score}/10</p>}
        </div>
      </div>
      <ul className="design-breakdown">
        {DIMENSIONS.map((d) => (
          <li key={d.key}>
            <strong>{take.breakdown[d.key]}/10</strong>
            {d.label}
            {previous && <span className="helper-text st-delta">{delta(take.breakdown[d.key], previous.breakdown[d.key])}</span>}
          </li>
        ))}
      </ul>
      <ul className="st-stats">
        <li>
          {stats.timed ? `Spoke for ${clock(stats.durationSec)}` : `Typed, about ${clock(stats.durationSec)} spoken`} (target {clock(targetSeconds)})
        </li>
        <li>{stats.wpm === null ? "Pace not measured (typed)" : `${stats.wpm} words a minute (130–160 is comfortable)`}</li>
        <li>
          {stats.fillers.count} filler word{stats.fillers.count === 1 ? "" : "s"}
          {stats.fillers.count > 0 && `: ${Object.entries(stats.fillers.words).map(([w, n]) => `"${w}" ×${n}`).join(", ")}`}
        </li>
        <li>
          {stats.hedges.count} hedging phrase{stats.hedges.count === 1 ? "" : "s"}
          {hedges.length > 0 && `: ${hedges.map(([w, n]) => `"${w}" ×${n}`).join(", ")}`}
        </li>
      </ul>
      <h4 className="feedback-list-title">How you came across</h4>
      <p>{take.cameAcross}</p>
      <h4 className="feedback-list-title">What worked</h4>
      <ul className="feedback-list">
        {take.strengths.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4 className="feedback-list-title">What would help most</h4>
      <ul className="feedback-list">
        {take.improvements.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4 className="feedback-list-title">A stronger version of your story</h4>
      <p className="helper-text">Built only from what you said. Fill in the [bracketed] gaps with your own details.</p>
      <div className="st-stronger">
        <Paragraphs text={take.strongerVersion} />
      </div>
      <h4 className="feedback-list-title">Outline to retell from</h4>
      <ol className="feedback-list">
        {take.outline.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <details className="st-transcript">
        <summary>What you said</summary>
        <Paragraphs text={take.transcript} />
      </details>
    </>
  );
}

function CompareTakes({ takes }: { takes: StoryTake[] }) {
  return (
    <div className="rl-table-wrap">
      <table className="rl-table">
        <caption className="visually-hidden">Scores for each take</caption>
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            {takes.map((t) => (
              <th key={t.id} scope="col">
                Take {t.number}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Overall</th>
            {takes.map((t) => (
              <td key={t.id}>{t.score}</td>
            ))}
          </tr>
          {DIMENSIONS.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              {takes.map((t) => (
                <td key={t.id}>{t.breakdown[d.key]}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">Words a minute</th>
            {takes.map((t) => (
              <td key={t.id}>{t.stats.wpm ?? "–"}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Fillers + hedges</th>
            {takes.map((t) => (
              <td key={t.id}>{t.stats.fillers.count + t.stats.hedges.count}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// /speak/:id: plan, record (or type), get marked, retell.
export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const speech = useSpeechRecognition();
  const [story, setStory] = useState<Story | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retelling, setRetelling] = useState(false);
  const [shownTake, setShownTake] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [planLeft, setPlanLeft] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Recorded time: finished stretches in recordedMs, plus the current one since segmentStart.
  const [recordedMs, setRecordedMs] = useState(0);
  const segmentStart = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setStory(null);
    setLoadError(null);
    storyApi
      .get(id!)
      .then((res) => !cancelled && setStory(res.story))
      .catch((err) => !cancelled && setLoadError(errorMessage(err, "Couldn't load this story")));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Counts recording time while the mic is on; the 1-second tick only refreshes the clock on screen.
  useEffect(() => {
    if (!speech.isListening) return;
    segmentStart.current = performance.now();
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      window.clearInterval(timer);
      if (segmentStart.current !== null) {
        const added = performance.now() - segmentStart.current;
        segmentStart.current = null;
        setRecordedMs((ms) => ms + added);
      }
    };
  }, [speech.isListening]);

  // The optional planning countdown.
  useEffect(() => {
    if (planLeft === null) return;
    if (planLeft === 0) {
      setAnnouncement("Planning time is up. Start recording when you're ready.");
      setPlanLeft(null);
      return;
    }
    const timer = window.setTimeout(() => setPlanLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [planLeft]);

  const recordedSec = Math.floor((recordedMs + (segmentStart.current !== null ? performance.now() - segmentStart.current : 0)) / 1000);

  function resetRecorder() {
    speech.stop();
    speech.resetTranscript();
    segmentStart.current = null;
    setRecordedMs(0);
    setPlanLeft(null);
    setError(null);
  }

  async function submit() {
    if (!story) return;
    speech.stop();
    const seconds = recordedSec;
    setSubmitting(true);
    setError(null);
    try {
      const res = await storyApi.submitTake(story.id, speech.transcript.trim(), seconds >= MIN_TIMED_SECONDS ? Math.min(600, seconds) : null);
      setStory(res.story);
      setShownTake(null);
      setRetelling(false);
      resetRecorder();
      setNotes("");
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(errorMessage(err, "Couldn't mark this take. Your words are still here; try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!story || !window.confirm("Delete this story and all its takes? This can't be undone.")) return;
    try {
      await storyApi.remove(story.id);
      navigate("/speak");
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete this story."));
    }
  }

  if (loadError)
    return (
      <div className="page">
        <p className="error-text" role="alert">
          {loadError}
        </p>
        <Link to="/speak">Back to Speak</Link>
      </div>
    );
  if (!story)
    return (
      <div className="page">
        <p className="helper-text">Loading…</p>
      </div>
    );

  const takes = story.takes;
  const latest = takes[takes.length - 1];
  const shownIndex = shownTake ?? takes.length - 1;
  const recording = takes.length === 0 || retelling;
  const canRetell = takes.length < story.maxTakes;
  const over = recordedSec > story.targetSeconds;

  return (
    <div className="page">
      <p>
        <Link to="/speak">← All stories</Link>
      </p>
      <h1 className="page-title">{KIND_LABELS[story.kind]}</h1>

      <section className="card" aria-labelledby="st-prompt-title">
        <h2 id="st-prompt-title" className="card-title">
          Your prompt
        </h2>
        <p className="st-prompt">{story.prompt}</p>
        <p className="helper-text">
          Audience: {story.audience ?? "anyone"} · Aim for about {minutes(story.targetSeconds)}
        </p>
        <h3 className="feedback-list-title">A shape that works</h3>
        <ol className="feedback-list">
          {story.shape.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {story.coachingNotes && (
          <>
            <h3 className="feedback-list-title">What a strong answer includes</h3>
            <ul className="feedback-list">
              {story.coachingNotes.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {recording && (
        <section className="card" aria-labelledby="st-record-title">
          <h2 id="st-record-title" className="card-title">
            {takes.length === 0 ? "Tell it" : `Retell it: take ${takes.length + 1} of ${story.maxTakes}`}
          </h2>
          {latest && (
            <>
              <h3 className="feedback-list-title">Retell from your outline</h3>
              <ol className="feedback-list">
                {latest.outline.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
          <div className="field">
            <label htmlFor="st-notes">Plan (optional, not marked or saved)</label>
            <textarea id="st-notes" className="input" rows={3} maxLength={2000} placeholder="Jot down your opening, three points and your ending" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="st-plan">
            {planLeft === null ? (
              <button type="button" className="btn btn-secondary" onClick={() => { setAnnouncement(""); setPlanLeft(PLAN_SECONDS); }} disabled={speech.isListening || submitting}>
                Start a {PLAN_SECONDS}-second plan
              </button>
            ) : (
              <>
                <span role="timer" aria-label="Planning time left">
                  Planning: {clock(planLeft)}
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => setPlanLeft(null)}>
                  Skip
                </button>
              </>
            )}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {announcement}
          </p>

          <MicButton isListening={speech.isListening} isSupported={speech.isSupported} onStart={speech.start} onStop={speech.stop} disabled={submitting} />
          <p className={`st-clock ${over ? "st-over" : ""}`} role="timer" aria-label="Time spoken">
            {clock(recordedSec)} / {clock(story.targetSeconds)}
            {over && ` (over by ${clock(recordedSec - story.targetSeconds)})`}
          </p>
          {speech.error && (
            <p className="error-text" role="alert">
              {speech.error}
            </p>
          )}
          <MicTestButton />
          <TranscriptBox value={speech.transcript} onChange={speech.setTranscript} disabled={submitting} />
          <p className="helper-text">
            Browsers often leave "um" and "uh" out of the transcript, so the filler count mostly catches words like "like" and "basically". If you type instead of
            speaking, your pace isn't measured.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="st-actions">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!speech.transcript.trim() || submitting}>
              {submitting ? "Marking your take…" : "Get feedback"}
            </button>
            {retelling && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetRecorder();
                  setRetelling(false);
                }}
                disabled={submitting}
              >
                Cancel retell
              </button>
            )}
          </div>
        </section>
      )}

      {takes.length > 0 && (
        <section ref={resultRef} tabIndex={-1} className="card debug-result" aria-labelledby="st-result-title">
          <h2 id="st-result-title" className="card-title">
            Feedback
          </h2>
          {takes.length > 1 && (
            <div className="segmented st-take-picker" role="group" aria-label="Show take">
              {takes.map((t, i) => (
                <button key={t.id} type="button" className={`segmented-option ${i === shownIndex ? "active" : ""}`} aria-pressed={i === shownIndex} onClick={() => setShownTake(i)}>
                  Take {t.number}
                </button>
              ))}
            </div>
          )}
          <TakeResult take={takes[shownIndex]} previous={takes[shownIndex - 1]} targetSeconds={story.targetSeconds} />
          {!recording && (
            <div className="st-actions">
              {canRetell ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    resetRecorder();
                    setRetelling(true);
                    requestAnimationFrame(() => document.getElementById("st-record-title")?.scrollIntoView({ block: "start" }));
                  }}
                >
                  Retell it
                </button>
              ) : (
                <p className="helper-text">You've used all {story.maxTakes} takes for this story.</p>
              )}
              <Link to="/speak" className="btn btn-secondary">
                New story
              </Link>
            </div>
          )}
        </section>
      )}

      {takes.length > 1 && (
        <section className="card" aria-labelledby="st-compare-title">
          <h2 id="st-compare-title" className="card-title">
            How your takes compare
          </h2>
          <CompareTakes takes={takes} />
        </section>
      )}

      <button type="button" className="btn btn-danger" onClick={remove} disabled={submitting || speech.isListening}>
        Delete this story
      </button>
    </div>
  );
}
