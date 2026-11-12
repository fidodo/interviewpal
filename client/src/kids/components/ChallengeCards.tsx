import { Stars } from "./bits";
import { TurtleCanvas } from "../runner/TurtleCanvas";
import { RunResult } from "../runner/runPython";
import { Attempt } from "../types";

export interface CheckResult {
  attempt: Attempt;
  leveledUp: boolean;
  courseComplete: boolean;
}

// "What happened": the turtle drawing, what was printed, or the error, after Run.
export function RunOutput({ run, showCanvas }: { run: RunResult; showCanvas: boolean }) {
  return (
    <section className="kids-card run-output" aria-labelledby="output-title">
      <h2 id="output-title" className="kids-card-title">
        What happened
      </h2>
      <div role="status">
        {showCanvas && <TurtleCanvas drawing={run.drawing} />}
        {run.stdout && (
          <>
            <h3 className="output-label">Printed:</h3>
            <pre className="console-output">{run.stdout}</pre>
          </>
        )}
        {run.error && (
          <div className="run-error">
            <h3 className="output-label">Oops! Something went wrong</h3>
            <pre>{run.error}</pre>
          </div>
        )}
        {!run.stdout && !run.error && !showCanvas && <p className="helper-text">Your program ran but didn't print anything.</p>}
      </div>
    </section>
  );
}

// Pal's verdict on the latest check: stars, praise, a hint or next idea, and any level-up.
export function CheckResultCard({ result, levelOrder }: { result: CheckResult; levelOrder: number }) {
  return (
    <section className={`kids-card check-result ${result.attempt.passed ? "is-passed" : ""}`} aria-labelledby="result-title" role="status">
      <h2 id="result-title" className="kids-card-title">
        {result.attempt.passed ? "You did it!" : "Not quite yet"}
      </h2>
      <Stars count={result.attempt.stars} />
      <p>{result.attempt.praise}</p>
      {result.attempt.nextStep && (
        <p className="next-step">
          <strong>{result.attempt.passed ? "Try this next: " : "Hint: "}</strong>
          {result.attempt.nextStep}
        </p>
      )}
      {result.leveledUp && <p className="level-up">Level up! You unlocked level {levelOrder + 1}. 🎉</p>}
      {result.courseComplete && <p className="level-up">You finished the whole course. Amazing work! 🏆</p>}
    </section>
  );
}
