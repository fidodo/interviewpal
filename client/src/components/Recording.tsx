import { useEffect, useState } from "react";
import { RETENTION_DAYS, canRecord, deleteRecording, getRecording, keepRecordings, setKeepRecordings } from "../audio/recordings";

// Plays back a recording kept in this browser, if there is one; renders nothing otherwise.
export function RecordingPlayer({ recordingKey, label = "Hear yourself" }: { recordingKey: string; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    getRecording(recordingKey).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [recordingKey]);

  async function remove() {
    await deleteRecording(recordingKey);
    setUrl(null);
    setStatus("Recording deleted.");
  }

  return (
    <div className="recording">
      {url && (
        <>
          <p className="recording-label">{label}</p>
          <audio className="recording-audio" controls preload="metadata" src={url} aria-label={label} />
          <p className="helper-text recording-note">
            Kept only in this browser for {RETENTION_DAYS} days.{" "}
            <button type="button" className="btn-link btn-link-inline" onClick={remove}>
              Delete recording
            </button>
          </p>
        </>
      )}
      <span className="visually-hidden" role="status">
        {status}
      </span>
    </div>
  );
}

// The "keep a recording" checkbox shown next to the mic. Hidden where the browser can't record.
export function RecordToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  if (!canRecord()) return null;
  return (
    <label className="checkbox-row recording-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          setKeepRecordings(e.target.checked);
          onChange(e.target.checked);
        }}
      />
      <span>Keep a recording on this device so I can replay it (never uploaded)</span>
    </label>
  );
}

export { keepRecordings };
