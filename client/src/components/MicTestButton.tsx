import { useMicTest } from "../hooks/useMicTest";

export function MicTestButton() {
  const { status, level, errorMessage, start, stop } = useMicTest();

  return (
    <div className="mic-test">
      <button type="button" className="btn btn-secondary" onClick={status === "testing" ? stop : start}>
        {status === "testing" ? "Stop test" : "Test microphone"}
      </button>

      {status === "testing" && (
        <>
          <div className="mic-test-meter">
            <div className="mic-test-meter-fill" style={{ width: `${level}%` }} />
          </div>
          <p className="helper-text">Say something…</p>
        </>
      )}
      {status === "working" && <p className="mic-test-ok">✓ Mic is working — we're picking up audio.</p>}
      {status === "silent" && (
        <p className="error-text">No audio detected. Check your mic is unmuted, connected, and allowed for this site.</p>
      )}
      {status === "error" && errorMessage && <p className="error-text">{errorMessage}</p>}
    </div>
  );
}
