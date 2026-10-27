import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const IS_MOBILE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// On mobile, recognition ends after every phrase or silence and we restart it. After this many
// restarts in a row with nothing heard, stop instead of looping (each restart beeps on Android).
const MAX_SILENT_RESTARTS = 3;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

function joinText(a: string, b: string): string {
  const left = a.trim();
  const right = b.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

function extendsPhrase(longer: string, shorter: string): boolean {
  return longer === shorter || longer.startsWith(`${shorter} `);
}

// Rebuilds the text for one recognition instance from its results, starting at `from`.
// Mobile Chrome often returns each result as the whole phrase so far ("I think", "I think the",
// "I think the answer"), so there a result that extends the previous one (on a word boundary)
// replaces it instead of being appended. Desktop results are distinct segments and are joined as-is.
function buildInstanceText(results: ArrayLike<SpeechRecognitionResultLike>, from: number): string {
  const parts: string[] = [];
  for (let i = from; i < results.length; i++) {
    const text = (results[i][0]?.transcript ?? "").trim();
    if (!text) continue;
    const last = parts[parts.length - 1];
    if (IS_MOBILE && last !== undefined) {
      const lastLower = last.toLowerCase();
      const textLower = text.toLowerCase();
      if (extendsPhrase(textLower, lastLower)) {
        parts[parts.length - 1] = text;
        continue;
      }
      if (extendsPhrase(lastLower, textLower)) continue;
    }
    parts.push(text);
  }
  return parts.join(" ");
}

export function useSpeechRecognition() {
  const isSupported = getSpeechRecognitionCtor() !== null;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscriptState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const baseTranscriptRef = useRef("");
  const instanceTextRef = useRef("");
  // Results before this index were already folded into the base (e.g. the user edited the text mid-recording).
  const resultOffsetRef = useRef(0);
  const resultCountRef = useRef(0);
  const heardAnythingRef = useRef(false);
  const heardThisInstanceRef = useRef(false);
  const silentRestartsRef = useRef(0);
  const silenceTimeoutRef = useRef<number | null>(null);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current !== null) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const commitInstanceText = useCallback(() => {
    baseTranscriptRef.current = joinText(baseTranscriptRef.current, instanceTextRef.current);
    instanceTextRef.current = "";
    resultOffsetRef.current = 0;
    resultCountRef.current = 0;
  }, []);

  const detach = useCallback((recognition: SpeechRecognitionLike | null) => {
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.stop();
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearSilenceTimeout();
      detach(recognitionRef.current);
    };
  }, [clearSilenceTimeout, detach]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't supported in this browser. Try Chrome or Edge, or type your answer below.");
      return;
    }
    setError(null);
    baseTranscriptRef.current = transcript.trim();
    instanceTextRef.current = "";
    resultOffsetRef.current = 0;
    resultCountRef.current = 0;
    heardAnythingRef.current = false;
    heardThisInstanceRef.current = false;
    silentRestartsRef.current = 0;

    const recognition = new Ctor();
    // Continuous mode duplicates words on mobile Chrome; there we listen one phrase at a time
    // and let onend restart recognition instead.
    recognition.continuous = !IS_MOBILE;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      resultCountRef.current = event.results.length;
      const text = buildInstanceText(event.results, resultOffsetRef.current);
      if (text) {
        heardAnythingRef.current = true;
        heardThisInstanceRef.current = true;
        clearSilenceTimeout();
      }
      instanceTextRef.current = text;
      setTranscriptState(joinText(baseTranscriptRef.current, text));
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      // Anything else (permissions, no device, network, service down) won't fix itself on restart.
      shouldListenRef.current = false;
      clearSilenceTimeout();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was denied. Allow microphone access for this site in your browser's settings, then tap the mic again.");
      } else if (event.error === "audio-capture") {
        setError("No microphone was found. Connect one and tap the mic again.");
      } else if (event.error === "network") {
        setError("Speech recognition needs an internet connection. Check your connection, or type your answer below.");
      } else {
        setError(`Mic error: ${event.error}. Tap the mic to try again, or type your answer below.`);
      }
    };

    recognition.onend = () => {
      commitInstanceText();
      silentRestartsRef.current = heardThisInstanceRef.current ? 0 : silentRestartsRef.current + 1;
      heardThisInstanceRef.current = false;
      if (shouldListenRef.current && silentRestartsRef.current >= MAX_SILENT_RESTARTS) {
        shouldListenRef.current = false;
        clearSilenceTimeout();
        if (heardAnythingRef.current) {
          setError("Stopped listening after a long pause. Tap the mic to keep going.");
        } else {
          setError(
            "Didn't hear anything, so the mic was turned off. Check it's unmuted and allowed for this site — try “Test microphone”, or type your answer below."
          );
        }
      }
      if (shouldListenRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          shouldListenRef.current = false;
        }
      }
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    setIsListening(true);
    recognition.start();

    clearSilenceTimeout();
    silenceTimeoutRef.current = window.setTimeout(() => {
      if (!heardAnythingRef.current) {
        setError(
          "Still not hearing anything. Check your mic is unmuted, connected, and allowed for this site — try the “Test microphone” button, or type your answer below."
        );
      }
    }, 7000);
  }, [transcript, clearSilenceTimeout, commitInstanceText]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimeout();
    commitInstanceText();
    detach(recognitionRef.current);
    recognitionRef.current = null;
    setIsListening(false);
  }, [clearSilenceTimeout, commitInstanceText, detach]);

  // Manual edits (typing in the transcript box). While recording, the edited text becomes the new base
  // and results already received are skipped, so the next result doesn't overwrite the edit.
  const setTranscript = useCallback((value: string) => {
    baseTranscriptRef.current = value;
    instanceTextRef.current = "";
    resultOffsetRef.current = resultCountRef.current;
    setTranscriptState(value);
  }, []);

  const resetTranscript = useCallback(() => {
    baseTranscriptRef.current = "";
    instanceTextRef.current = "";
    resultOffsetRef.current = resultCountRef.current;
    setTranscriptState("");
  }, []);

  return { isSupported, isListening, transcript, setTranscript, error, start, stop, resetTranscript };
}
