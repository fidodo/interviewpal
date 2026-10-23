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

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't supported in this browser. Try Chrome or Edge, or type your answer below.");
      return;
    }
    setError(null);
    baseTranscriptRef.current = transcript ? `${transcript} ` : "";
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
      if (final) baseTranscriptRef.current += final;
      setTranscript(baseTranscriptRef.current + interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
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
  }, [transcript]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    baseTranscriptRef.current = "";
    setTranscript("");
  }, []);

  return { isSupported, isListening, transcript, setTranscript, error, start, stop, resetTranscript };
}
