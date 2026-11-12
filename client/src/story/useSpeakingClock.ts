import { useCallback, useEffect, useRef, useState } from "react";

// Seconds spoken: counted only while `listening` (the mic is on), across any number of on/off stretches. The 1-second
// tick only refreshes the clock on screen.
export function useSpeakingClock(listening: boolean) {
  // Finished stretches in recordedMs, plus the current one since segmentStart.
  const [recordedMs, setRecordedMs] = useState(0);
  const segmentStart = useRef<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!listening) return;
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
  }, [listening]);

  const reset = useCallback(() => {
    segmentStart.current = null;
    setRecordedMs(0);
  }, []);

  const seconds = Math.floor((recordedMs + (segmentStart.current !== null ? performance.now() - segmentStart.current : 0)) / 1000);
  return { seconds, reset };
}
