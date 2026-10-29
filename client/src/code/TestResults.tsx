import { CodeSpec, TestRun } from "./protocol";

const show = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// Pass/fail per test case, with inputs, expected and actual values, plus anything the code printed.
export function TestResults({ run, spec }: { run: TestRun; spec: CodeSpec }) {
  return (
    <div className="test-results" role="status">
      <p className={`test-summary ${run.total > 0 && run.passed === run.total ? "all-passed" : ""}`}>
        {run.error && run.total === 0 ? "Your code didn't run." : `${run.passed} of ${run.total} tests passed`}
      </p>
      {run.error && <pre className="test-error">{run.error}</pre>}
      {run.results.length > 0 && (
        <ol className="test-list">
          {run.results.map((r, i) => (
            <li key={i} className={r.passed ? "test-pass" : "test-fail"}>
              <span className="test-status">{r.passed ? "Pass" : "Fail"}</span>
              <code>
                {spec.functionName}({spec.tests[i]?.args.map(show).join(", ")})
              </code>
              {!r.passed && (
                <span className="test-detail">
                  {r.error ? r.error : `expected ${show(spec.tests[i]?.expected)}, got ${show(r.got)}`}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {run.output && (
        <>
          <p className="test-output-label">Printed output</p>
          <pre className="test-output">{run.output}</pre>
        </>
      )}
    </div>
  );
}
