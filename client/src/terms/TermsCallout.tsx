import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { termsApi } from "../api/terms";
import { TermsSummary } from "./types";

// The Terms entry point on the dashboard and the Learn page: what's due today, or how to start.
export function TermsCallout() {
  const [summary, setSummary] = useState<TermsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    termsApi
      .summary()
      .then((res) => !cancelled && setSummary(res.summary))
      .catch(() => {
        // Not essential to the page it sits on; leave it hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) return null;
  const waiting = summary.due + summary.newToday;
  return (
    <section className={`card review-callout ${waiting ? "has-due" : ""}`} aria-labelledby="terms-callout-title">
      <h2 id="terms-callout-title" className="card-title">
        Interview terms
      </h2>
      {summary.total === 0 ? (
        <>
          <p className="helper-text">Learn the terms interviewers expect, from recognising them to using them in a spoken answer.</p>
          <Link to="/terms" className="btn btn-primary">
            Pick your terms
          </Link>
        </>
      ) : (
        <>
          <p>
            {waiting > 0
              ? `${summary.due} due and ${summary.newToday} new today.`
              : `All done for today. ${summary.mastered} of ${summary.total} term${summary.total === 1 ? "" : "s"} mastered.`}
          </p>
          <div className="tm-actions">
            {waiting > 0 && (
              <Link to="/terms/review" className="btn btn-primary">
                Review terms
              </Link>
            )}
            <Link to="/terms" className="btn btn-secondary">
              Your terms
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
