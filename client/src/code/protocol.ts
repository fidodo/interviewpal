// Runnable coding answers: a function signature plus JSON test cases (from the server's CodeSpec).
export interface CodeSpec {
  functionName: string;
  params: string[];
  tests: { args: unknown[]; expected: unknown }[];
}

export type RunLanguage = "python" | "javascript";

export interface TestCaseResult {
  passed: boolean;
  got?: unknown;
  error?: string;
}

export interface TestRun {
  language: RunLanguage;
  results: TestCaseResult[];
  passed: number;
  total: number;
  // Printed output (console.log / print), and an error that stopped the code before the tests ran.
  output: string;
  error: string | null;
}

// Messages for the JavaScript runner worker.
export interface JsRunRequest {
  id: number;
  code: string;
  functionName: string;
  tests: CodeSpec["tests"];
}

export interface JsRunResponse {
  id: number;
  results: TestCaseResult[];
  logs: string[];
  error: string | null;
}

// A starting stub matching the spec's signature.
export function starterCode(language: RunLanguage, spec: CodeSpec): string {
  const params = spec.params.join(", ");
  return language === "python"
    ? `def ${spec.functionName}(${params}):\n    # Write your solution here\n    pass\n`
    : `function ${spec.functionName}(${params}) {\n  // Write your solution here\n}\n`;
}
