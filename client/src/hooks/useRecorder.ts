import { useCallback, useEffect, useRef } from "react";
import { canRecord } from "../audio/recordings";

// Records the microphone alongside speech recognition, so the speaker can replay their answer. It follows
// `active` (the mic being on): the first time it turns on, recording starts; turning off pauses it and turning on
// again resumes, so one answer is one recording however many times the mic is toggled. finish() hands back the
// audio; reset() throws it away. The microphone stream is always released on finish, reset and unmount.
export function useRecorder(active: boolean, enabled: boolean) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Bumped by reset/finish so a getUserMedia call still in flight knows it's no longer wanted.
  const generationRef = useRef(0);
  const startingRef = useRef(false);

  const release = useCallback(() => {
    generationRef.current += 1;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped.
        }
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    startingRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !canRecord()) return;
    const recorder = recorderRef.current;
    if (active) {
      if (recorder) {
        if (recorder.state === "paused") recorder.resume();
        return;
      }
      if (startingRef.current) return;
      startingRef.current = true;
      const generation = generationRef.current;
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (generation !== generationRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          const next = new MediaRecorder(stream);
          chunksRef.current = [];
          next.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
          next.start(1000);
          streamRef.current = stream;
          recorderRef.current = next;
        })
        .catch(() => {
          // No permission or no mic: speech recognition reports its own problems; we just don't record.
        })
        .finally(() => {
          if (generation === generationRef.current) startingRef.current = false;
        });
    } else if (recorder?.state === "recording") {
      recorder.pause();
    }
  }, [active, enabled]);

  useEffect(() => release, [release]);
  // Turning recordings off mid-answer drops what was recorded so far.
  useEffect(() => {
    if (!enabled) {
      chunksRef.current = [];
      release();
    }
  }, [enabled, release]);

  const finish = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder) {
      release();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const type = recorder.mimeType || "audio/webm";
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        resolve(chunks.length ? new Blob(chunks, { type }) : null);
      };
      // Stop the recorder ourselves so its last chunk arrives, then release the microphone.
      recorderRef.current = null;
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      generationRef.current += 1;
      startingRef.current = false;
    });
  }, [release]);

  const reset = useCallback(() => {
    chunksRef.current = [];
    release();
  }, [release]);

  return { finish, reset };
}
