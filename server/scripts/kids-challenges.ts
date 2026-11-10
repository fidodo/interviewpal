// Measures the challenges Pal writes for the kids course: instruction length, whether they list the solution, and
// (with the new generator) the size of the intended solution against the level's budget. Not deployed; writes
// nothing to the database.
//   npx tsx scripts/kids-challenges.ts baseline   the original prompt, one call each
//   npx tsx scripts/kids-challenges.ts            the current generator (budget, checks and retries)
// Saves every challenge to scripts/kids-challenges.<mode>.json for reading.
import fs from "node:fs";
import path from "node:path";
import { codingPython } from "../prisma/curriculum/coding-python";
import { generateValidated } from "../src/ai/retry";
import { challengePrompt, LevelContext } from "../src/kids/kids.prompts";
import { generatedChallengeSchema } from "../src/kids/kids.schemas";
import { LevelEditor } from "../src/kids/types";

const mode = process.argv[2] === "baseline" ? "baseline" : "new";
const LEVELS = [1, 2, 4, 5, 8, 11];
const AGES = [7, 11];
const PER = 3;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const lines = (s: string) => s.split(/\n/).filter((l) => l.trim()).length;
// Instructions that read like a solution: a numbered list longer than 3 items.
const numberedSteps = (s: string) => s.split(/\n/).filter((l) => /^\s*\d+[.)]/.test(l)).length;

async function generate(level: LevelContext, age: number) {
  const child = { name: "Sam", age };
  if (mode === "baseline") {
    const g = await generateValidated(challengePrompt({ child, level, passedAtLevel: 0, history: [] }), generatedChallengeSchema);
    return { challenge: g, attempts: 1, problems: [] as string[], planStatements: null as number | null, budget: null as number | null };
  }
  // The new generator, loaded lazily so the baseline run doesn't need it.
  const { generateChallenge } = await import("../src/kids/kids.service");
  const { countStatements, solutionBudget } = await import("../src/kids/challengeBudget");
  const r = await generateChallenge({ child, level, passedAtLevel: 0, history: [] });
  return { challenge: r.challenge, attempts: r.attempts, problems: r.problems, planStatements: countStatements(r.challenge.plan ?? ""), budget: solutionBudget(level, age) };
}

async function main() {
  const rows: Record<string, unknown>[] = [];
  for (const order of LEVELS) {
    // Levels are numbered by their position in the course.
    const def = codingPython.levels[order - 1];
    const level: LevelContext = {
      order,
      title: def.title,
      editor: def.editor as LevelEditor,
      concepts: def.concepts,
      toolbox: def.toolbox ?? [],
      challengesToPass: 3,
    };
    for (const age of AGES) {
      for (let i = 0; i < PER; i++) {
        const t0 = Date.now();
        try {
          const r = await generate(level, age);
          const ins = r.challenge.instructions;
          rows.push({ level: order, age, title: r.challenge.title, words: words(ins), lines: lines(ins), numbered: numberedSteps(ins), plan: r.planStatements, budget: r.budget, attempts: r.attempts, problems: r.problems, sec: Math.round((Date.now() - t0) / 100) / 10, instructions: ins, story: r.challenge.story, planText: (r.challenge as { plan?: string | null }).plan ?? null });
          process.stdout.write(".");
        } catch (err) {
          rows.push({ level: order, age, error: String(err).slice(0, 200) });
          process.stdout.write("x");
        }
      }
    }
  }
  console.log("\n");
  console.table(rows.map(({ instructions, story, problems, planText, ...r }) => ({ ...r, problems: Array.isArray(problems) ? problems.length : "" })));
  const ok = rows.filter((r) => !r.error);
  const avg = (k: string) => Math.round((ok.reduce((s, r) => s + (r[k] as number), 0) / ok.length) * 10) / 10;
  console.log(`${mode}: ${ok.length}/${rows.length} generated; average ${avg("words")} words, ${avg("lines")} lines; ${ok.filter((r) => (r.numbered as number) > 3).length} with more than 3 numbered steps; longest ${Math.max(...ok.map((r) => r.words as number))} words`);
  fs.writeFileSync(path.join(__dirname, `kids-challenges.${mode}.json`), JSON.stringify(rows, null, 2));
}

main().then(() => process.exit(0));
