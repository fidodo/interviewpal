import { CheckResult } from "./types";
import { pct } from "./ragLabUtils";

// A run's checks against the level's targets.
export function ChecksTable({ checks, caption }: { checks: CheckResult[]; caption: string }) {
  return (
    <div className="rl-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="rl-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Yours</th>
            <th scope="col">Needed</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={`${c.metric}:${c.category}`}>
              <td>{c.label}</td>
              <td>{pct(c.value)}</td>
              <td>{pct(c.threshold)}</td>
              <td className={c.passed ? "rl-pass" : "rl-fail"}>{c.passed ? "✓ Pass" : "✗ Not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
