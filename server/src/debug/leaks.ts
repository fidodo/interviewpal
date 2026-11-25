// After a mark the reference fix stays hidden so the learner can improve and resubmit (utils/attempts.ts). The prompt
// asks the marker not to write the fix, but on a one-line bug its "step" can still be the exact change (about 1 in 3
// on gpt-oss-120b). This checks the marker's words in code: anything containing the fix is replaced or dropped.
import { normaliseCode } from "./format";

type Bug = { buggySnippet?: string | null; fixedSnippet?: string | null };
type Part = "fix" | "explanation" | "quality" | "hints";

// Said instead of a step that gave the fix away.
const SAFE_STEP: Record<Part, string> = {
  fix: "Find the bug that's still in the code: re-read the bug report, then trace one failing input through the code line by line.",
  explanation: "Explain the root cause, why it caused the reported symptom, and an input that exposes it.",
  quality: "Make a small, targeted change that fixes the bug without rewriting the rest.",
  hints: "Solve the next one without hints.",
};
const SAFE_REASON: Record<string, string> = {
  fix: "Your code doesn't fix every planted bug yet.",
  explanation: "Your explanation doesn't cover the root cause fully yet.",
  quality: "The fix isn't complete or targeted yet.",
};

const MIN_FRAGMENT = 5;

export function fixLeakChecker(bugs: Bug[], buggyCode: string, referenceFix: string) {
  const buggy = normaliseCode(buggyCode);
  // What's only in the fix: each bug's fixed snippet, and the reference fix's changed lines that don't appear in the
  // buggy code at all.
  const buggyLines = new Set(buggyCode.split("\n").map((l) => normaliseCode(l)).filter(Boolean));
  const fragments = [
    ...bugs.map((b) => (b.fixedSnippet ? normaliseCode(b.fixedSnippet) : "")),
    ...referenceFix
      .split("\n")
      .map((l) => normaliseCode(l))
      .filter((l) => !buggyLines.has(l) && !buggy.includes(l)),
  ].filter((f) => f.length >= MIN_FRAGMENT);
  // Quoting the buggy code is fine ("i < n - 1" contains the fix "i < n"), so the buggy parts are taken out first.
  const quoted = [...bugs.map((b) => (b.buggySnippet ? normaliseCode(b.buggySnippet) : "")), ...buggyLines]
    .filter((q) => q.length >= MIN_FRAGMENT)
    .sort((a, b) => b.length - a.length);

  return function leaks(text: string): boolean {
    if (fragments.length === 0) return false;
    let t = normaliseCode(text);
    for (const q of quoted) t = t.split(q).join("\u0000");
    return fragments.some((f) => t.includes(f));
  };
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);

export function scrubFix<S extends { part: Part; step: string }>(
  leaks: (text: string) => boolean,
  mark: { reasons: Record<string, string>; toImprove: S[]; feedback: string }
) {
  const dropLeaking = (text: string) => sentences(text).filter((s) => !leaks(s)).join(" ").trim();
  const reasons = Object.fromEntries(
    Object.entries(mark.reasons).map(([part, reason]) => [part, leaks(reason) ? dropLeaking(reason) || (SAFE_REASON[part] ?? "") : reason])
  );
  return {
    reasons,
    toImprove: mark.toImprove.map((s) => (leaks(s.step) ? { ...s, step: SAFE_STEP[s.part] } : s)),
    feedback: leaks(mark.feedback) ? dropLeaking(mark.feedback) || "The steps above say what to work on next." : mark.feedback,
  };
}
