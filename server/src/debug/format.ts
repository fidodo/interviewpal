import type { Options } from "prettier";
import { DebugLanguage } from "./debug.prompts";

// Prettier parser per stack. Only the JS family: there's no formatter for the other stacks in this runtime, so those
// rely on the prompt asking for formatted code (and the line check in challengeSchema).
const PARSERS: Partial<Record<DebugLanguage, Options["parser"]>> = { javascript: "babel", react: "babel", typescript: "typescript" };

export const canFormat = (language: string) => language in PARSERS;

// Reformats code without changing what it does, so planted bugs survive (e.g. `if (code = 'X')` keeps its `=`). Code
// that doesn't parse (a junior exercise may have a syntax error) comes back unchanged.
export async function formatCode(language: string, code: string): Promise<string> {
  const parser = PARSERS[language as DebugLanguage];
  if (!parser) return code;
  try {
    // Prettier 3 is published as ESM with a CommonJS entry; a plain require keeps this CommonJS build simple.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prettier = require("prettier") as typeof import("prettier");
    const formatted = await prettier.format(code, { parser, printWidth: 100, singleQuote: false });
    return formatted.trimEnd() + "\n";
  } catch {
    return code;
  }
}

// Code compared without layout: whitespace, semicolons, parentheses and trailing commas removed, and quotes unified,
// so a snippet written before formatting still matches the formatted code (Prettier adds parentheses around e.g. an
// assignment in a condition), and a learner's own spacing doesn't matter. Only used for matching, never shown.
export function normaliseCode(code: string): string {
  return code
    .replace(/['`]/g, '"')
    .replace(/,(\s*[)\]}])/g, "$1")
    .replace(/[;()]/g, "")
    .replace(/\s+/g, "");
}
