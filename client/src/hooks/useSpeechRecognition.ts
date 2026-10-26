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

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function useSpeechRecognition() {
  const isSupported = getSpeechRecognitionCtor() !== null;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const baseTranscriptRef = useRef("");
  const heardAnythingRef = useRef(false);
  const silenceTimeoutRef = useRef<number | null>(null);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current !== null) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearSilenceTimeout();
      recognitionRef.current?.stop();
    };
  }, [clearSilenceTimeout]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't supported in this browser. Try Chrome or Edge, or type your answer below.");
      return;
    }
    setError(null);
    baseTranscriptRef.current = transcript ? `${transcript} ` : "";
    heardAnythingRef.current = false;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final || interim) {
        heardAnythingRef.current = true;
        clearSilenceTimeout();
      }
      if (final) baseTranscriptRef.current += final;
      setTranscript(baseTranscriptRef.current + interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was denied. Allow microphone access for this site in your browser's settings, then tap the mic again.");
        return;
      }
      if (event.error === "audio-capture") {
        setError("No microphone was found. Connect one and tap the mic again.");
        return;
      }
      setError(`Mic error: ${event.error}`);
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        recognition.start();
      } else {
        setIsListening(false);
      }
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
  }, [transcript, clearSilenceTimeout]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimeout();
    recognitionRef.current?.stop();
    setIsListening(false);
  }, [clearSilenceTimeout]);

  const resetTranscript = useCallback(() => {
    baseTranscriptRef.current = "";
    setTranscript("");
  }, []);

  return { isSupported, isListening, transcript, setTranscript, error, start, stop, resetTranscript };
}
