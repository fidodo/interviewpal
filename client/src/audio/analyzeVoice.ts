// Voice figures from a take's recording, worked out in this browser: the audio never leaves the device, only these
// numbers are sent with the take. Everything here is an estimate from a laptop or phone mic, and is shown as one.
//
// - Pauses: silences of at least PAUSE_SEC between stretches of speech (silence before the first word and after the
//   last one doesn't count).
// - Pitch range: the spread of the voice's pitch in semitones (10th to 90th percentile, so a squeak or a dropped
//   frame doesn't count). Under about 4 sounds flat; 8 or more sounds lively.
// - Trail-off: phrases whose last quarter is much quieter than their start, a common habit that swallows the
//   point of a sentence.

export interface VoiceStats {
  speakingSec: number;
  pauses: { count: number; perMinute: number; averageSec: number; longestSec: number; longCount: number };
  // null when too little voiced speech was found to judge.
  pitchRangeSemitones: number | null;
  phrases: number;
  // Share of phrases (0-1) that trail off; null with fewer than 2 phrases.
  trailOffShare: number | null;
}

const RATE = 8000; // Decoded at 8 kHz: plenty for speech pitch (75-400 Hz) and loudness, and quick to process.
const FRAME_SEC = 0.03;
export const PAUSE_SEC = 0.4;
export const LONG_PAUSE_SEC = 3;
const MIN_PHRASE_SEC = 1;
const TRAIL_DROP_DB = 6;
const MIN_VOICED_FRAMES = 20;

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

// The pitch of one frame by normalised autocorrelation, or null if the frame isn't clearly voiced.
function framePitch(samples: Float32Array, start: number, size: number, rate: number): number | null {
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 75);
  if (start + size + maxLag > samples.length) return null;
  let energy = 0;
  for (let i = 0; i < size; i++) energy += samples[start + i] * samples[start + i];
  if (energy === 0) return null;
  let bestLag = -1;
  let best = 0;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    let lagEnergy = 0;
    for (let i = 0; i < size; i++) {
      const b = samples[start + i + lag];
      sum += samples[start + i] * b;
      lagEnergy += b * b;
    }
    const c = lagEnergy > 0 ? sum / Math.sqrt(energy * lagEnergy) : 0;
    corr[lag] = c;
    if (lag <= maxLag && c > best) {
      best = c;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.6) return null;
  // Prefer the shortest lag that's nearly as strong, so a pitch isn't read an octave low.
  for (let lag = minLag; lag < bestLag; lag++) {
    if (corr[lag] > 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  // Parabolic interpolation between neighbouring lags for a finer estimate.
  const a = corr[bestLag - 1] ?? 0;
  const b = corr[bestLag];
  const c = corr[bestLag + 1] ?? 0;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return rate / (bestLag + shift);
}

// The figures for mono samples at `rate` Hz. Pure, so it can be tested on generated audio.
export function analyzeSamples(samples: Float32Array, rate: number): VoiceStats | null {
  const frame = Math.round(FRAME_SEC * rate);
  const frames = Math.floor(samples.length / frame);
  if (frames < 10) return null;

  const db: number[] = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    db.push(10 * Math.log10(sum / frame + 1e-12));
  }
  // Speech vs silence: a threshold between the noise floor and the speaking level, so it adapts to the mic.
  const sorted = [...db].sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.9);
  if (loud - floor < 10) return null; // No clear speech above the background.
  const threshold = floor + 0.35 * (loud - floor);
  const speech = db.map((d) => d > threshold);

  const first = speech.indexOf(true);
  const last = speech.lastIndexOf(true);
  if (first < 0) return null;

  // Runs of silence between first and last speech; gaps under PAUSE_SEC are just the space between words.
  const pauseFrames = Math.round(PAUSE_SEC / FRAME_SEC);
  const pauses: number[] = [];
  const phrases: [number, number][] = [];
  let phraseStart = first;
  for (let f = first; f <= last; ) {
    if (speech[f]) {
      f++;
      continue;
    }
    let end = f;
    while (end <= last && !speech[end]) end++;
    if (end - f >= pauseFrames) {
      pauses.push((end - f) * FRAME_SEC);
      phrases.push([phraseStart, f]);
      phraseStart = end;
    }
    f = end;
  }
  phrases.push([phraseStart, last + 1]);

  const speakingSec = round(speech.filter(Boolean).length * FRAME_SEC);
  const spanMin = ((last - first + 1) * FRAME_SEC) / 60;

  // Pitch on speech frames, with a 40 ms window.
  const pitchWindow = Math.round(0.04 * rate);
  const pitches: number[] = [];
  for (let f = first; f <= last; f++) {
    if (!speech[f]) continue;
    const p = framePitch(samples, f * frame, pitchWindow, rate);
    if (p !== null) pitches.push(p);
  }
  let pitchRangeSemitones: number | null = null;
  if (pitches.length >= MIN_VOICED_FRAMES) {
    const semis = pitches.map((p) => 12 * Math.log2(p / 100)).sort((a, b) => a - b);
    pitchRangeSemitones = round(percentile(semis, 0.9) - percentile(semis, 0.1));
  }

  // Trail-off: the last quarter of a phrase at least TRAIL_DROP_DB quieter than its first half.
  const minPhrase = Math.round(MIN_PHRASE_SEC / FRAME_SEC);
  const mean = (from: number, to: number) => {
    let sum = 0;
    let n = 0;
    for (let f = from; f < to; f++)
      if (speech[f]) {
        sum += db[f];
        n++;
      }
    return n ? sum / n : null;
  };
  const longPhrases = phrases.filter(([a, b]) => b - a >= minPhrase);
  let trailing = 0;
  for (const [a, b] of longPhrases) {
    const len = b - a;
    const start = mean(a, a + Math.floor(len / 2));
    const end = mean(b - Math.floor(len / 4), b);
    if (start !== null && end !== null && start - end >= TRAIL_DROP_DB) trailing++;
  }

  return {
    speakingSec,
    pauses: {
      count: pauses.length,
      perMinute: spanMin > 0 ? round(pauses.length / spanMin) : 0,
      averageSec: pauses.length ? round(pauses.reduce((s, p) => s + p, 0) / pauses.length) : 0,
      longestSec: pauses.length ? round(Math.max(...pauses)) : 0,
      longCount: pauses.filter((p) => p >= LONG_PAUSE_SEC).length,
    },
    pitchRangeSemitones,
    phrases: phrases.length,
    trailOffShare: longPhrases.length >= 2 ? round(trailing / longPhrases.length, 2) : null,
  };
}

// Decodes a recording and analyses it. Resolves null when the browser can't decode it or there's no clear speech;
// never throws, so a take is never held up by this.
export async function analyzeVoice(blob: Blob): Promise<VoiceStats | null> {
  try {
    if (typeof OfflineAudioContext === "undefined") return null;
    const bytes = await blob.arrayBuffer();
    // 8 kHz is quickest; some browsers (older Safari) refuse low rates, so fall back to 22.05 kHz.
    let audio: AudioBuffer | null = null;
    for (const rate of [RATE, 22050]) {
      try {
        audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.slice(0));
        break;
      } catch {
        // Try the next rate.
      }
    }
    if (!audio) return null;
    // Mono: average the channels.
    const samples = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < data.length; i++) samples[i] += data[i] / audio.numberOfChannels;
    }
    return analyzeSamples(samples, audio.sampleRate);
  } catch {
    return null;
  }
}
