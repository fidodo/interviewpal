import { useCallback, useRef, useState } from "react";

export type MicTestStatus = "idle" | "testing" | "working" | "silent" | "error";

const TEST_DURATION_MS = 6000;
const LEVEL_THRESHOLD = 8;

export function useMicTest() {
  const [status, setStatus] = useState<MicTestStatus>("idle");
  const [level, setLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const heardRef = useRef(false);

  const release = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    rafRef.current = null;
    timeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    release();
    setStatus("idle");
  }, [release]);

  const start = useCallback(async () => {
    release();
    setErrorMessage(null);
    setStatus("testing");
    heardRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const pct = Math.min(100, Math.round(rms * 400));
        setLevel(pct);
        if (pct > LEVEL_THRESHOLD) {
          heardRef.current = true;
          setStatus("working");
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      timeoutRef.current = window.setTimeout(() => {
        if (!heardRef.current) setStatus("silent");
        release();
      }, TEST_DURATION_MS);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMessage("Microphone access was denied. Allow microphone access for this site in your browser's settings, then try again.");
      } else if (name === "NotFoundError") {
        setErrorMessage("No microphone was found. Connect one and try again.");
      } else {
        setErrorMessage("Couldn't access the microphone. Check your browser and OS mic permissions.");
      }
      setStatus("error");
    }
  }, [release]);

  return { status, level, errorMessage, start, stop };
}
