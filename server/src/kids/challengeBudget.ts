// How big a kids challenge may be, and the checks that keep Pal to it. Pal is asked for a short goal plus a hidden
// plan (its own solution as Python); the plan's size is checked here, in code, because models don't keep to limits
// they're only told about. Pure functions, so they can be tested without the AI.
import { LevelContext } from "./kids.prompts";
import { LevelEditor } from "./types";

export const MAX_INSTRUCTION_LINES = 3;

// The most statements (blocks, or lines of typed Python) the intended solution may take.
export function solutionBudget(level: Pick<LevelContext, "order" | "editor">, age: number) {
  const base = level.editor === LevelEditor.BLOCKS ? (level.order <= 2 ? 8 : 10) : level.order <= 8 ? 10 : 16;
  // Younger children: about a quarter less, never under 5.
  return age < 9 ? Math.max(5, Math.round(base * 0.75)) : base;
}

// The longest the instructions (the goal) may be, in words.
export function wordBudget(age: number) {
  return age < 9 ? 30 : age < 12 ? 45 : 60;
}

// Setting up the turtle isn't a step the learner builds (blocks drive it directly).
const SETUP = /^(import|from)\s|turtle\.(Turtle|Screen)\(\)/;

// Models sometimes send code with literal "\n" instead of line breaks (escaped twice in the JSON). Unescape it when
// there are no real line breaks, and split statements written on one line with ";".
export function normalisePlan(python: string) {
  const text = !python.includes("\n") && python.includes("\\n") ? python.replace(/\\n/g, "\n").replace(/\\t/g, "  ") : python;
  return text
    .split("\n")
    .flatMap((l) => {
      const indent = l.match(/^\s*/)![0];
      return l.split(";").map((part, i) => (i === 0 ? part : indent + part.trim()));
    })
    .join("\n");
}

// Statements in a Python program: non-empty lines that aren't a comment, turtle setup or a closing bracket.
export function countStatements(python: string) {
  return normalisePlan(python)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !SETUP.test(l) && !/^[)\]}]+$/.test(l)).length;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Python that a block level's toolbox can't make. Blockly's generator writes `for count in range(n):` for "repeat",
// so a loop is only allowed when the toolbox has loops.
const NEEDS: { category: string; pattern: RegExp; what: string }[] = [
  { category: "loops", pattern: /^\s*(for|while)\b/m, what: "a loop" },
  { category: "logic", pattern: /^\s*(if|elif)\b/m, what: "an if" },
  { category: "variables", pattern: /^\s*[A-Za-z_]\w*\s*[+\-*/]?=(?!=)/m, what: "a variable" },
  { category: "text", pattern: /\bprint\(/, what: "print" },
];

// Problems with a generated challenge, in words the model can act on; empty when it's fine.
export function checkChallenge(c: { instructions: string; plan?: string | null }, level: Pick<LevelContext, "order" | "editor" | "toolbox">, age: number) {
  const problems: string[] = [];
  const ins = c.instructions.trim();
  const lineCount = ins.split("\n").filter((l) => l.trim()).length;
  const numbered = ins.split("\n").filter((l) => /^\s*\d+[.)]/.test(l)).length;
  const maxWords = wordBudget(age);
  if (words(ins) > maxWords) problems.push(`the instructions are ${words(ins)} words long and the limit is ${maxWords}`);
  if (lineCount > MAX_INSTRUCTION_LINES) problems.push(`the instructions have ${lineCount} lines and the limit is ${MAX_INSTRUCTION_LINES}`);
  if (numbered > MAX_INSTRUCTION_LINES) problems.push(`the instructions list ${numbered} numbered steps, which gives away the solution`);

  const plan = normalisePlan(c.plan?.trim() ?? "");
  const planBody = plan
    .split("\n")
    .filter((l) => !SETUP.test(l.trim()))
    .join("\n");
  if (!plan) problems.push(`"plan" (your own solution) is missing`);
  else {
    const budget = solutionBudget(level, age);
    const size = countStatements(plan);
    if (size === 0) problems.push(`"plan" has no steps: write your solution as Python, one statement per line`);
    if (size > budget) problems.push(`the solution needs ${size} ${level.editor === LevelEditor.BLOCKS ? "blocks" : "lines"} and the limit is ${budget}`);
    if (level.editor === LevelEditor.BLOCKS) {
      for (const n of NEEDS) if (!level.toolbox.includes(n.category) && n.pattern.test(planBody)) problems.push(`the solution uses ${n.what}, but there's no ${n.category} block at this level`);
    }
  }
  return problems;
}
