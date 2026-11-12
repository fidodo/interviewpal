// Voice figures for a Speak take: measured in the speaker's browser from the recording
// (client/src/audio/analyzeVoice.ts). Only these numbers are sent, never the audio, and they're approximate. Here:
// the schema that bounds them, what they mean, and how they're put to the marker.
import { z } from "zod";

export const voiceSchema = z.object({
  speakingSec: z.number().min(0).max(900),
  pauses: z.object({
    count: z.number().int().min(0).max(500),
    perMinute: z.number().min(0).max(200),
    averageSec: z.number().min(0).max(600),
    longestSec: z.number().min(0).max(600),
    longCount: z.number().int().min(0).max(500),
  }),
  pitchRangeSemitones: z.number().min(0).max(48).nullable(),
  phrases: z.number().int().min(0).max(1000),
  trailOffShare: z.number().min(0).max(1).nullable(),
});
export type VoiceStats = z.infer<typeof voiceSchema>;

// What the voice figures mean, shared by the marker and the take result.
export const VOICE_TARGETS = { flatBelowSemitones: 4, livelyFromSemitones: 8, trailOffShare: 0.4, longPauseSec: 3 };

// Voice findings worth a comment, worked out in code (like delivery) so the marker doesn't have to judge the numbers.
export function voiceIssues(v: VoiceStats, kind: string) {
  const issues: string[] = [];
  if (kind === "PAUSE" && v.pauses.count < 2) issues.push(`only ${v.pauses.count} clear pause${v.pauses.count === 1 ? "" : "s"}, so the three points ran together`);
  else if (v.pauses.count === 0 && v.speakingSec >= 20) issues.push("no real pauses: it may have sounded rushed");
  if (v.pauses.longCount > 0) issues.push(`${v.pauses.longCount} silence${v.pauses.longCount === 1 ? "" : "s"} over ${VOICE_TARGETS.longPauseSec}s`);
  if (v.pitchRangeSemitones !== null && v.pitchRangeSemitones < VOICE_TARGETS.flatBelowSemitones) issues.push(`a narrow pitch range (${v.pitchRangeSemitones} semitones), which can sound flat`);
  if (v.trailOffShare !== null && v.trailOffShare >= VOICE_TARGETS.trailOffShare) issues.push(`volume dropping at the end of ${Math.round(v.trailOffShare * 100)}% of phrases`);
  return issues;
}

// The voice figures as written into the marking prompt, with the findings the marker must mention.
export function voiceFacts(v: VoiceStats, kind: string) {
  const pitch = v.pitchRangeSemitones === null ? "pitch range not measured" : `pitch range ${v.pitchRangeSemitones} semitones`;
  const trail = v.trailOffShare === null ? "" : `; volume dropped at the end of ${Math.round(v.trailOffShare * 100)}% of phrases`;
  const issues = voiceIssues(v, kind);
  return [
    `Voice, measured in the speaker's browser from the recording (approximate): ${v.pauses.count} pauses of 0.4s or more (longest ${v.pauses.longestSec}s); ${pitch}${trail}.`,
    issues.length
      ? `From the recording, worth a comment: ${issues.join("; ")}. Name the first of these in the delivery or presence reason, and make one of the improvements about it, with a concrete fix.`
      : `The recording shows nothing to fix in the voice; you may mention it as a strength.`,
    kind === "PAUSE" && v.pauses.count < 2 ? `Pausing between points is what this drill trains, so delivery can't score above 5.` : ``,
  ]
    .filter(Boolean)
    .join(" ");
}
