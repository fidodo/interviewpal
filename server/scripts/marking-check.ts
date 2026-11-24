// Calibration for marking that's made of parts (the *.rubric.ts files): marks fixed sample answers several times and
// checks every AI-marked part lands within 1 point of what a careful human marker would give, every time. Run it
// before shipping a rubric or prompt change. Not deployed; writes nothing to the database.
//   npx tsx scripts/marking-check.ts [section] [runs]     section: debug (default); runs: 3 (default)
//   MARKING_GAP_MS=15000 sets the pause between calls (free plans allow only a few a minute).
import { generateValidated } from "../src/ai/retry";
import { debugGradeSchema, gradePrompt } from "../src/debug/debug.prompts";
import { fixPoints, improvementSteps, scoreParts } from "../src/debug/debug.rubric";

const section = process.argv[2] ?? "debug";
const runs = Number(process.argv[3] ?? 3);
const TOLERANCE = 1;
// Free model plans allow a few marking calls a minute; space them out so the check measures marking, not limits.
const GAP_MS = Number(process.env.MARKING_GAP_MS ?? 15000);
const pause = () => new Promise((r) => setTimeout(r, GAP_MS));

// One small exercise with one planted bug, answered four ways.
const exercise = {
  language: "javascript" as const,
  level: "JUNIOR",
  scenario:
    "totalForOrders adds up the order totals for a report. Finance says the report is always short by one order: with three orders, only the first two are counted.",
  buggyCode: `function totalForOrders(orders) {
  let total = 0;

  for (let i = 0; i < orders.length - 1; i++) {
    total += orders[i].amount;
  }

  return Math.round(total * 100) / 100;
}`,
  bugs: [{ description: "Off-by-one: the loop stops at orders.length - 1, so the last order is never added." }],
  referenceFix: `function totalForOrders(orders) {
  let total = 0;

  for (let i = 0; i < orders.length; i++) {
    total += orders[i].amount;
  }

  return Math.round(total * 100) / 100;
}`,
};

const rewrite = `function totalForOrders(orders) {
  return Math.round(orders.reduce((sum, o) => sum + o.amount, 0) * 100) / 100;
}`;

const samples: { name: string; code: string; explanation: string; expect: { explanation: number; quality: number } }[] = [
  {
    name: "correct fix, one-line explanation (the '8' case)",
    code: exercise.referenceFix,
    explanation: "Fixed the loop condition.",
    expect: { explanation: 1, quality: 2 },
  },
  {
    name: "correct fix, full explanation",
    code: exercise.referenceFix,
    explanation:
      "The loop ran while i < orders.length - 1, so it stopped one early and the last order was never added: that's why the report was always one order short. Changed it to i < orders.length. A test with a single order would have caught it, since the total came out as 0.",
    expect: { explanation: 3, quality: 2 },
  },
  {
    name: "correct fix, names the root cause only",
    code: exercise.referenceFix,
    explanation: "Off-by-one error: the loop condition used length - 1 so it skipped the last element.",
    expect: { explanation: 2, quality: 2 },
  },
  {
    name: "works, but rewrites the function",
    code: rewrite,
    explanation: "Rewrote it with reduce so there's no index to get wrong.",
    expect: { explanation: 1, quality: 1 },
  },
];

async function checkDebug() {
  let failures = 0;
  for (const s of samples) {
    const results: string[] = [];
    for (let r = 0; r < runs; r++) {
      await pause();
      const grade = await generateValidated(
        gradePrompt({ ...exercise, submittedCode: s.code, explanation: s.explanation, testResults: { passed: 4, total: 4 }, hintsUsed: 0 }),
        debugGradeSchema
      );
      const { parts, score } = scoreParts({
        fix: fixPoints(Math.min(grade.bugsFixed, 1), 1, { passed: 4, total: 4 }),
        explanation: grade.explanation,
        quality: grade.quality,
        hintsUsed: 0,
      });
      const off = Math.max(Math.abs(parts.explanation - s.expect.explanation), Math.abs(parts.quality - s.expect.quality));
      if (off > TOLERANCE) failures++;
      const steps = improvementSteps(parts, grade.toImprove).map((t) => `+${t.points} ${t.part}: ${t.step}`);
      results.push(`  run ${r + 1}: ${off > TOLERANCE ? "FAIL" : "ok  "} explanation ${parts.explanation}, quality ${parts.quality} -> ${score}\n      ${steps.join("\n      ") || "(no steps)"}`);
    }
    console.log(`${s.name} (expect explanation ${s.expect.explanation}, quality ${s.expect.quality})\n${results.join("\n")}`);
  }
  return failures;
}

const checks: Record<string, () => Promise<number>> = { debug: checkDebug };

(async () => {
  const check = checks[section];
  if (!check) throw new Error(`Unknown section "${section}". Try: ${Object.keys(checks).join(", ")}`);
  const failures = await check();
  console.log(failures ? `\n${failures} run(s) off by more than ${TOLERANCE} point` : `\nALL WITHIN ${TOLERANCE} POINT`);
  process.exit(failures ? 1 : 0);
})();
