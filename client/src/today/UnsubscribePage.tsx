import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

// /unsubscribe: the link at the bottom of every reminder email. No login needed; the link is signed.
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"working" | "done" | string>("working");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const u = params.get("u") ?? "";
    const t = params.get("t") ?? "";
    api
      .post(`/reminders/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`)
      .then(() => setState("done"))
      .catch((err) => setState(err instanceof ApiError ? err.message : "Couldn't turn off reminders. Try again from your account page."));
  }, [params]);

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Daily reminders</h1>
      <div className="card" role="status">
        {state === "working" && <p>Turning off your daily reminders…</p>}
        {state === "done" && (
          <p>
            Daily reminders are off. You won't get any more. You can turn them back on from <Link to="/account">your account page</Link>.
          </p>
        )}
        {state !== "working" && state !== "done" && <p className="error-text">{state}</p>}
      </div>
    </div>
  );
}
