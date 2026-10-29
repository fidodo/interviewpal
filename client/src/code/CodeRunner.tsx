import { useEffect, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { TestResults } from "./TestResults";
import { runTests } from "./runTests";
import { CodeSpec, RunLanguage, TestRun } from "./protocol";

interface CodeRunnerProps {
  // Language of the editor. Tests only run for Python and JavaScript.
  language: string;
  spec: CodeSpec | null;
  initialCode: string;
  editorKey: string;
  labelledBy: string;
  disabled?: boolean;
  onCodeChange: (code: string) => void;
  onRun?: (run: TestRun) => void;
}

const RUNNABLE: RunLanguage[] = ["python", "javascript"];

// A code editor with a "Run tests" button and results. Code-editing stacks that can't run in the browser just get
// the editor.
export function CodeRunner({ language, spec, initialCode, editorKey, labelledBy, disabled, onCodeChange, onRun }: CodeRunnerProps) {
  const [code, setCode] = useState(initialCode);
  const [run, setRun] = useState<TestRun | null>(null);
  const [running, setRunning] = useState(false);
  const runnable = spec != null && (RUNNABLE as string[]).includes(language);

  // A new editor (language switch, reset) starts with no results; old ones would describe different code.
  useEffect(() => setRun(null), [editorKey]);

  async function handleRun() {
    if (!spec) return;
    setRunning(true);
    setRun(null);
    try {
      const result = await runTests(language as RunLanguage, code, spec);
      setRun(result);
      onRun?.(result);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="code-runner">
      <CodeEditor
        key={editorKey}
        initialCode={initialCode}
        language={language}
        labelledBy={labelledBy}
        onChange={(next) => {
          setCode(next);
          onCodeChange(next);
        }}
      />
      {runnable && (
        <div className="code-runner-bar">
          <button type="button" className="btn btn-secondary" onClick={handleRun} disabled={running || disabled}>
            <span aria-hidden="true">▶</span> {running ? (language === "python" ? "Running (Python may take a moment the first time)…" : "Running…") : "Run tests"}
          </button>
          <span className="helper-text">{spec!.tests.length} test cases</span>
        </div>
      )}
      {run && spec && <TestResults run={run} spec={spec} />}
    </div>
  );
}
