import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SaveToBank } from "./BankPages";
import { RecordToggle, keepRecordings } from "../components/Recording";
import { useRecorder } from "../hooks/useRecorder";
import { saveRecording } from "../audio/recordings";
import { analyzeVoice } from "../audio/analyzeVoice";
import { storyApi } from "../api/story";
import { MicButton } from "../components/MicButton";
import { MicTestButton } from "../components/MicTestButton";
import { TranscriptBox } from "../components/TranscriptBox";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { nextFocus } from "./nextFocus";
import { FrameworkBody } from "./Frameworks";
import { CompareTakes, ScoreGuide } from "./ScoreGuide";
import { TakeResult } from "./TakeResult";
import { stopSpeaking, useConversation } from "./useConversation";
import { useSpeakingClock } from "./useSpeakingClock";
import { MIN_TIMED_SECONDS, PLAN_SECONDS, clock, errorMessage, minutes } from "./speakUtils";
import { Dimension, DrillKind, KIND_LABELS, Story, StoryTake } from "./types";

// A fresh prompt for the same drill (no AI call).
function AnotherDrill({ kind }: { kind: DrillKind }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { story } = await storyApi.createDrill(kind);
            navigate(`/speak/${story.id}`);
          } catch (err) {
            setError(errorMessage(err, "Couldn't start another drill. Try again."));
            setBusy(false);
          }
        }}
      >
        {busy ? "Starting…" : "Another prompt"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// After the last take of a round: the next round of the same story (same prompt and notes, fresh takes).
function PractiseAgain({ story }: { story: Story }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // Always ask the server: it returns the existing next round, or makes a new one if that was deleted.
    setStarting(true);
    setError(null);
    try {
      const res = await storyApi.again(story.id);
      navigate(`/speak/${res.story.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the next round. Try again."));
      setStarting(false);
    }
  }

  return (
    <div className="st-again">
      <p className="helper-text">You've used all {story.maxTakes} takes in this round. Keep going with the same story, or try a new one.</p>
      <button type="button" className="btn btn-primary" onClick={start} disabled={starting}>
        {story.nextRoundId ? `Go to round ${story.round + 1}` : starting ? "Starting…" : "Practise this story again"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function WorkOnNext({ takes, fillersLimit }: { takes: StoryTake[]; fillersLimit: number }) {
  const focus = nextFocus(takes, fillersLimit);
  if (!focus) return null;
  return (
    <section className="st-next" aria-labelledby="st-next-title">
      <h3 id="st-next-title" className="feedback-list-title">
        What to work on next
      </h3>
      <p>
        <strong>{focus.label}</strong> is your lowest score lately ({focus.average}/10). {focus.tip}
      </p>
      {focus.notes.length > 0 && (
        <ul className="feedback-list">
          {focus.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="helper-text">
        Also try the <Link to="/speak/bank/drill">"Which story fits?" drill</Link>, or see your trend on the <Link to="/progress">progress page</Link>.
      </p>
    </section>
  );
}

// /speak/:id: plan, record (or type), get marked, retell.
export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const speech = useSpeechRecognition();
  const [story, setStory] = useState<Story | null>(null);
  // Which rows of "What a good score looks like" are open (the score table's links open them too).
  const [guideOpen, setGuideOpen] = useState<Set<Dimension>>(() => new Set());
  const toggleGuide = (d: Dimension, open: boolean) =>
    setGuideOpen((prev) => {
      if (prev.has(d) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(d);
      else next.delete(d);
      return next;
    });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retelling, setRetelling] = useState(false);
  const [shownTake, setShownTake] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [planLeft, setPlanLeft] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Seconds spoken so far (counted only while the mic is on).
  const speakingClock = useSpeakingClock(speech.isListening);
  // Audio of the take being told, kept only in this browser (see audio/recordings.ts).
  const [keepAudio, setKeepAudio] = useState(keepRecordings);
  // Always recorded while the mic is on, so the voice can be measured; "keep a recording" only decides whether the
  // audio is saved afterwards.
  const recorder = useRecorder(speech.isListening, true);
  // A conversation in progress: your turns and the other person's replies (kept here until you submit).
  const conversation = useConversation(story);
  // A recording already finished for a submit that failed, so a retry still saves it.
  const pendingAudio = useRef<Blob | null>(null);
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

  const recordedSec = speakingClock.seconds;

  function resetRecorder() {
    conversation.reset();
    speech.stop();
    recorder.reset();
    pendingAudio.current = null;
    speech.resetTranscript();
    speakingClock.reset();
    setPlanLeft(null);
    setError(null);
  }

  // Sends your line and gets the other person's reply. On failure your line goes back in the box to try again.
  async function sendTurn() {
    const text = speech.transcript.trim();
    if (!text) return;
    speech.stop();
    speech.resetTranscript();
    setError(null);
    try {
      const reply = await conversation.send(text);
      setAnnouncement(`They say: ${reply}`);
    } catch (err) {
      speech.setTranscript(text);
      setError(errorMessage(err, "Couldn't get their reply. Your words are still here; try again."));
    }
  }

  async function submit() {
    if (!story) return;
    stopSpeaking();
    speech.stop();
    const conversationTurns = story.conversation ? conversation.turnsToSubmit(speech.transcript.trim()) : null;
    const seconds = recordedSec;
    setSubmitting(true);
    setError(null);
    try {
      pendingAudio.current = (await recorder.finish()) ?? pendingAudio.current;
      const timed = seconds >= MIN_TIMED_SECONDS;
      // Measured here; only the numbers are sent.
      const voice = timed && pendingAudio.current ? await analyzeVoice(pendingAudio.current) : null;
      const res = await storyApi.submitTake(story.id, conversationTurns ? null : speech.transcript.trim(), timed ? Math.min(600, seconds) : null, voice, conversationTurns);
      const saved = res.story.takes[res.story.takes.length - 1];
      if (keepAudio && pendingAudio.current && saved) await saveRecording(`take:${saved.id}`, pendingAudio.current);
      pendingAudio.current = null;
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
  const { turns, replying, readAloud, yourTurns, over: conversationOver } = conversation;

  return (
    <div className="page">
      <p>
        <Link to={story.drill ? "/speak#drills" : "/speak"}>{story.drill ? "← All drills" : "← All stories"}</Link>
        {story.continuesFromId && (
          <>
            {" · "}
            <Link to={`/speak/${story.continuesFromId}`}>Round {story.round - 1}</Link>
          </>
        )}
      </p>
      <h1 className="page-title">
        {KIND_LABELS[story.kind]}
        {story.round > 1 && `: round ${story.round}`}
      </h1>

      <section className="card" aria-labelledby="st-prompt-title">
        <h2 id="st-prompt-title" className="card-title">
          {story.conversation ? "The conversation" : "Your prompt"}
        </h2>
        {story.conversation && <p className="helper-text">{story.topic}</p>}
        <p className="st-prompt">{story.conversation ? `They start: "${story.prompt}"` : story.prompt}</p>
        <p className="helper-text">
          {story.conversation
            ? `You're talking to ${story.audience ?? "someone new"} · Up to ${story.conversation.maxTurns} turns, about ${minutes(story.targetSeconds)} of your speaking in all`
            : `Audience: ${story.audience ?? "anyone"} · Aim for about ${minutes(story.targetSeconds)}`}
        </p>
        {/* The full cheat sheet before the first take; folded away once you've told it. */}
        <details className="st-shape" open={takes.length === 0}>
          <summary>
            <strong>How to shape it: {story.framework.main.name}</strong>
          </summary>
          <FrameworkBody framework={story.framework.main} />
          <p className="helper-text">
            {story.framework.also.length > 0 && (
              <>
                Also works for this:{" "}
                {story.framework.also.map((f, i) => (
                  <span key={f.key}>
                    {i > 0 && ", "}
                    <Link to={`/speak/frameworks#${f.key}`}>{f.name}</Link>
                  </span>
                ))}
                .{" "}
              </>
            )}
            <Link to="/speak/frameworks">All speaking frameworks</Link>
          </p>
        </details>
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
            {takes.length === 0 && story.round === 1 ? "Tell it" : `${takes.length === 0 ? "Tell it again" : "Retell it"}: take ${takes.length + 1} of ${story.maxTakes}`}
          </h2>
          {story.conversation && (
            <>
              <ol className="st-chat" aria-label="The conversation so far">
                <li className="st-chat-them">
                  <span className="st-chat-who">Them</span>
                  {story.prompt}
                </li>
                {turns.map((t, i) => (
                  <li key={i} className={t.role === "you" ? "st-chat-you" : "st-chat-them"}>
                    <span className="st-chat-who">{t.role === "you" ? "You" : "Them"}</span>
                    {t.text}
                  </li>
                ))}
                {replying && (
                  <li className="st-chat-them">
                    <span className="st-chat-who">Them</span>
                    <span className="helper-text">Thinking about what you said…</span>
                  </li>
                )}
              </ol>
              {"speechSynthesis" in window && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={readAloud}
                    onChange={(e) => {
                      conversation.setReadAloud(e.target.checked);
                    }}
                  />
                  <span>Read their replies aloud</span>
                </label>
              )}
            </>
          )}
          {latest && !story.conversation && (
            <>
              <h3 className="feedback-list-title">Retell from your outline</h3>
              <ol className="feedback-list">
                {latest.outline.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {!story.conversation && (
          <>
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
          </>
          )}
          <p className="visually-hidden" aria-live="polite">
            {announcement}
          </p>

          {story.conversation && (
            <p className="helper-text">
              {conversationOver
                ? "That's the end of the conversation. Get your feedback below."
                : `Your turn ${yourTurns + 1} of ${story.conversation.maxTurns}: answer, add one detail, then ask something back.`}
            </p>
          )}
          <MicButton
            isListening={speech.isListening}
            isSupported={speech.isSupported}
            onStart={() => {
              stopSpeaking();
              speech.start();
            }}
            onStop={speech.stop}
            disabled={submitting || replying || conversationOver}
          />
          <RecordToggle value={keepAudio} onChange={setKeepAudio} />
          <p className="helper-text">Your pauses, pitch and volume are measured from the recording in this browser. Only the numbers are sent, never the audio.</p>
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
            {story.conversation && !conversationOver && (
              <button type="button" className="btn btn-primary" onClick={sendTurn} disabled={!speech.transcript.trim() || replying || submitting}>
                {replying ? "Waiting for their reply…" : "Send"}
              </button>
            )}
            <button
              type="button"
              className={`btn ${story.conversation && !conversationOver ? "btn-secondary" : "btn-primary"}`}
              onClick={submit}
              disabled={submitting || replying || (story.conversation ? yourTurns + (speech.transcript.trim() ? 1 : 0) < story.conversation.minTurns : !speech.transcript.trim())}
            >
              {submitting ? "Marking your take…" : story.conversation ? "Finish and get feedback" : "Get feedback"}
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
          {shownIndex === 0 && story.round > 1 && <p className="helper-text">This take was marked against your last take in round {story.round - 1}.</p>}
          <TakeResult take={takes[shownIndex]} previous={takes[shownIndex - 1]} targetSeconds={story.targetSeconds} wpm={story.guide.deliveryTargets.wpm} focus={story.drill?.focus} voiceTargets={story.voiceTargets} />
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
              ) : story.drill ? null : (
                <PractiseAgain story={story} />
              )}
              {story.drill ? (
                <AnotherDrill kind={story.kind as DrillKind} />
              ) : (
                <Link to="/speak" className="btn btn-secondary">
                  New story
                </Link>
              )}
            </div>
          )}
          {!recording && !canRetell && <WorkOnNext takes={takes} fillersLimit={story.guide.deliveryTargets.fillersPer100} />}
          {!recording && !story.drill && <SaveToBank storyId={story.id} bankEntryId={story.bankEntryId} onSaved={(id) => setStory((s) => (s ? { ...s, bankEntryId: id } : s))} />}
        </section>
      )}

      {takes.length > 1 && (
        <section className="card" aria-labelledby="st-compare-title">
          <h2 id="st-compare-title" className="card-title">
            How your takes compare
          </h2>
          <CompareTakes takes={takes} onOpenGuide={(d) => toggleGuide(d, true)} />
        </section>
      )}

      {takes.length > 0 && (
        <section className="card" aria-labelledby="st-guide-title">
          <h2 id="st-guide-title" className="card-title">
            What a good score looks like
          </h2>
          <ScoreGuide guide={story.guide} take={takes[takes.length - 1]} targetSeconds={story.targetSeconds} openKeys={guideOpen} onToggle={toggleGuide} />
        </section>
      )}

      <button type="button" className="btn btn-danger" onClick={remove} disabled={submitting || speech.isListening}>
        Delete this story
      </button>
    </div>
  );
}
