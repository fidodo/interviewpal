// Compares candidate AI models on the app's real interview prompts. Not deployed; writes nothing to the database.
//   npx tsx scripts/compare-models.ts [filter]      e.g. "mistral" to run only Mistral models
// Prints a table (first-time schema pass rate, average seconds per call, whether grading ranks answers correctly)
// and saves every output to scripts/compare-models.out.json for reading side by side.
import fs from "node:fs";
import path from "node:path";
import { AIProvider } from "../src/ai/provider.interface";
import { GroqProvider } from "../src/ai/groq.provider";
import { MistralProvider } from "../src/ai/mistral.provider";
import { GeminiProvider } from "../src/ai/gemini.provider";
import { env } from "../src/config/env";

const candidates: { name: string; key: string; make: () => AIProvider }[] = [
  { name: "groq gpt-oss-120b", key: env.groq.apiKey, make: () => new GroqProvider("openai/gpt-oss-120b", 4) },
  { name: "groq qwen3.8-27b", key: env.groq.apiKey, make: () => new GroqProvider("qwen/qwen3.8-27b", 4) },
  { name: "mistral-large-4", key: env.mistral.apiKey, make: () => new MistralProvider("mistral-large-4", 4) },
  
  { name: "gemma-4-31b-it", key: env.gemini.apiKey, make: () => new GeminiProvider("gemma-4-31b-it") },
  { name: "gemini-3.5-flash-lite", key: env.gemini.apiKey, make: () => new GeminiProvider("gemini-3.5-flash-lite") },
];

const QUESTION = "Explain how React's useEffect cleanup works, and when it runs.";
const answers = {
  strong:
    "The function you return from useEffect is the cleanup. React runs it before the effect runs again because a dependency changed, and once when the component unmounts. In development with StrictMode it also runs an extra mount-unmount-mount cycle to surface missing cleanups. You use it to remove event listeners, clear timers, abort fetches with an AbortController or unsubscribe, so you don't leak memory or set state on an unmounted component. For example, an effect that adds a resize listener returns a function that removes the same listener.",
  weak: "Cleanup is something you do in useEffect. I think it runs at some point, maybe when the page loads. It's for cleaning things.",
  offTopic: "I'd use a relational database with an index on the user id column, and cache the hot rows in Redis.",
};

type Case = { label: string; run: (p: AIProvider) => Promise<unknown> };
const cases: Case[] = [
  ...["Frontend", "Backend", "AI Engineering"].map((track) => ({
    label: `question ${track}`,
    run: (p: AIProvider) => p.generateQuestion({ topic: track === "Frontend" ? "React" : track === "Backend" ? "REST APIs" : "RAG", track, difficulty: "INTERMEDIATE", priorQA: [] }),
  })),
  {
    label: "question coding",
    run: (p) =>
      p.generateQuestion({
        topic: "JavaScript arrays",
        track: "Frontend",
        difficulty: "INTERMEDIATE",
        priorQA: [{ question: "What is a closure?", answer: "A function plus the variables it captures.", score: 8, questionType: "VERBAL" }],
      }),
  },
  ...(["strong", "weak", "offTopic"] as const).map((k) => ({
    label: `grade ${k}`,
    run: (p: AIProvider) => p.gradeAnswer({ question: QUESTION, transcript: answers[k], difficulty: "INTERMEDIATE", questionType: "VERBAL" }),
  })),
  {
    label: "summary",
    run: (p) =>
      p.generateSummary({
        topic: "React",
        track: "Frontend",
        difficulty: "INTERMEDIATE",
        priorQA: [
          { question: QUESTION, answer: answers.strong, score: 9, questionType: "VERBAL" },
          { question: "What does React.memo do?", answer: answers.weak, score: 3, questionType: "VERBAL" },
        ],
      }),
  },
];

async function main() {
const filter = process.argv[2]?.toLowerCase();
const rows: Record<string, unknown>[] = [];
const outputs: Record<string, Record<string, unknown>> = {};
for (const c of candidates) {
  if (filter && !c.name.toLowerCase().includes(filter)) continue;
  if (!c.key) {
    console.log(`skip ${c.name}: no API key`);
    continue;
  }
  const provider = c.make();
  outputs[c.name] = {};
  let ok = 0;
  let totalMs = 0;
  const scores: Record<string, number> = {};
  for (const k of cases) {
    const t0 = Date.now();
    try {
      const out = await k.run(provider);
      ok++;
      outputs[c.name][k.label] = out;
      if (k.label.startsWith("grade ")) scores[k.label.slice(6)] = (out as { score: number }).score;
      if (k.label === "question coding") outputs[c.name][k.label + " (type)"] = (out as { type: string; code?: unknown }).type + ((out as { code?: unknown }).code ? " +spec" : "");
    } catch (err) {
      outputs[c.name][k.label] = { error: (err as Error).message.slice(0, 300) };
    }
    totalMs += Date.now() - t0;
    process.stdout.write(".");
  }
  const ranked = scores.strong > scores.weak && scores.weak >= scores.offTopic;
  rows.push({
    model: c.name,
    passed: `${ok}/${cases.length}`,
    "avg s": (totalMs / cases.length / 1000).toFixed(1),
    scores: `${scores.strong ?? "-"} / ${scores.weak ?? "-"} / ${scores.offTopic ?? "-"}`,
    ranked: ranked ? "yes" : "no",
  });
  console.log(` ${c.name} done`);
}
console.table(rows);
fs.writeFileSync(path.join(__dirname, "compare-models.out.json"), JSON.stringify(outputs, null, 2));
console.log("Outputs saved to scripts/compare-models.out.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
