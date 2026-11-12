import { RecordingPlayer } from "../components/Recording";
import { ScoreBadge } from "../components/ScoreBadge";
import { clock, delta } from "./speakUtils";
import { DIMENSIONS, Dimension, StoryTake, VoiceStats, VoiceTargets } from "./types";

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        // Blank lines split paragraphs; a conversation's stronger version has one "You:" line per turn.
        .split(/\n\s*\n|\n(?=You:)/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

export function TakeResult({
  take,
  previous,
  targetSeconds,
  wpm,
  focus,
  voiceTargets,
}: {
  take: StoryTake;
  previous?: StoryTake;
  targetSeconds: number;
  wpm: [number, number];
  // A drill's dimension: shown first, with the marker's reason.
  focus?: Dimension;
  voiceTargets: VoiceTargets;
}) {
  const { stats } = take;
  const hedges = Object.entries(stats.hedges.phrases);
  const focusLabel = focus && DIMENSIONS.find((d) => d.key === focus)?.label;
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
      {focus && (
        <p className="st-focus">
          <strong>
            This drill trains {focusLabel?.toLowerCase()}: {take.breakdown[focus]}/10
            {previous && ` (${delta(take.breakdown[focus], previous.breakdown[focus])})`}.
          </strong>{" "}
          {take.reasons?.[focus]}
        </p>
      )}
      <RecordingPlayer recordingKey={`take:${take.id}`} label={`Hear take ${take.number}`} />
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
        <li>{stats.wpm === null ? "Pace not measured (typed)" : `${stats.wpm} words a minute (${wpm[0]}–${wpm[1]} is comfortable)`}</li>
        <li>
          {stats.fillers.count} filler word{stats.fillers.count === 1 ? "" : "s"}
          {stats.fillers.count > 0 && `: ${Object.entries(stats.fillers.words).map(([w, n]) => `"${w}" ×${n}`).join(", ")}`}
        </li>
        <li>
          {stats.hedges.count} hedging phrase{stats.hedges.count === 1 ? "" : "s"}
          {hedges.length > 0 && `: ${hedges.map(([w, n]) => `"${w}" ×${n}`).join(", ")}`}
        </li>
      </ul>
      {stats.voice && <VoiceResult voice={stats.voice} targets={voiceTargets} />}
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

// "Your voice": pauses, pitch range and trail-off from the recording, each with what it means and a tip.
function VoiceResult({ voice, targets }: { voice: VoiceStats; targets: VoiceTargets }) {
  const { pauses, pitchRangeSemitones: range, trailOffShare: trail } = voice;
  const rows: { figure: string; tip: string | null }[] = [];
  rows.push({
    figure: `${pauses.count} pause${pauses.count === 1 ? "" : "s"} (about ${pauses.perMinute} a minute${pauses.count ? `, longest ${pauses.longestSec}s` : ""})`,
    tip:
      pauses.count === 0 && voice.speakingSec >= 20
        ? "No real pauses: you may be rushing. Stop for a second after each point; it gives the listener time to keep up."
        : pauses.longCount > 0
          ? `${pauses.longCount} pause${pauses.longCount === 1 ? " was" : "s were"} over ${targets.longPauseSec} seconds. If you lost your place, a 60-second plan first helps.`
          : null,
  });
  if (range !== null)
    rows.push({
      figure: `Pitch range: ${range} semitones (${range < targets.flatBelowSemitones ? "flat" : range >= targets.livelyFromSemitones ? "lively" : "some variety"})`,
      tip: range < targets.flatBelowSemitones ? "Your voice stayed on much the same note, which can sound flat. Lift your voice on the key word of each point." : null,
    });
  if (trail !== null)
    rows.push({
      figure: `Volume dropped at the end of ${Math.round(trail * 100)}% of phrases`,
      tip: trail >= targets.trailOffShare ? "Keep your voice up through the last word: the end of a sentence is usually the point." : null,
    });
  return (
    <>
      <h4 className="feedback-list-title">Your voice (measured from the recording, approximate)</h4>
      <ul className="feedback-list">
        {rows.map((r) => (
          <li key={r.figure}>
            {r.figure}
            {r.tip && (
              <>
                . <span className="st-voice-tip">{r.tip}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
