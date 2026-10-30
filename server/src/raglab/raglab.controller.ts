import { Response } from "express";
import { z } from "zod";
import { embeddingsEnabled, embedTexts } from "../ai/embeddings";
import { AuthedRequest } from "../middleware/auth.middleware";
import { refundBudget, spendBudget } from "../middleware/rateLimit";
import { retryOnRateLimit } from "../ai/retry";
import { parseJsonObject } from "../utils/json";
import { CORPUS } from "./corpus";
import { labProvider } from "./labModel";
import { caseOutputSchema, usageSchema } from "./grader";
import { LEVELS, METRIC_LABELS, PLAYABLE_LEVELS } from "./levels";
import * as lab from "./raglab.service";
import { LANGUAGES } from "./starters";

// Daily toolkit budgets per user (admin exempt). Cached embeddings are free.
// Groq's free allowance for the lab model is 1,000 calls a day for the whole app.
const LLM_CALLS_PER_DAY = 150;
const EMBEDDED_TEXTS_PER_DAY = 5000;
const MAX_CODE = 60000;

function notFound(res: Response, what = "Project") {
  res.status(404).json({ error: `${what} not found` });
}

async function withLabErrors(res: Response, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof lab.LabError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export function getLevels(_req: AuthedRequest, res: Response) {
  res.json({
    levels: LEVELS.map((l) => ({ ...l, playable: !!l.checks })),
    metricLabels: METRIC_LABELS,
    playableLevels: PLAYABLE_LEVELS,
    embeddingsEnabled: embeddingsEnabled(),
  });
}

export function getCorpus(_req: AuthedRequest, res: Response) {
  res.json({ docs: CORPUS });
}

export async function listProjects(req: AuthedRequest, res: Response) {
  res.json({ projects: await lab.listProjects(req.userId!) });
}

export async function createProject(req: AuthedRequest, res: Response) {
  const parsed = z.object({ name: z.string().trim().min(1).max(60), language: z.enum(LANGUAGES) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Give the project a name (up to 60 characters) and pick a language" });
    return;
  }
  await withLabErrors(res, async () => {
    const project = await lab.createProject(req.userId!, parsed.data.name, parsed.data.language);
    res.status(201).json({ project: { id: project.id } });
  });
}

export async function getProject(req: AuthedRequest, res: Response) {
  const project = await lab.findProject(req.userId!, req.params.id);
  if (!project) return notFound(res);
  const attempts = await lab.listAttempts(project.id);
  res.json({
    project: { id: project.id, name: project.name, language: project.language, level: project.level, code: project.code },
    attempts: attempts.map((a) => ({ ...a, metrics: parseJsonObject(a.metrics) })),
  });
}

export async function saveCode(req: AuthedRequest, res: Response) {
  const parsed = z.object({ code: z.string().max(MAX_CODE) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Your code is over ${MAX_CODE} characters` });
    return;
  }
  if (!(await lab.saveCode(req.userId!, req.params.id, parsed.data.code))) return notFound(res);
  res.json({ ok: true });
}

export async function deleteProject(req: AuthedRequest, res: Response) {
  if (!(await lab.deleteProject(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}

export async function startAttempt(req: AuthedRequest, res: Response) {
  const parsed = z.object({ kind: z.enum(["PRACTICE", "HELDOUT"]), code: z.string().max(MAX_CODE) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a practice or held-out run" });
    return;
  }
  await withLabErrors(res, async () => {
    const started = await lab.startAttempt(req.userId!, req.params.id, parsed.data.kind, parsed.data.code);
    if (!started) return notFound(res);
    res.status(201).json({ attempt: { id: started.attempt.id, level: started.attempt.level, kind: started.attempt.kind }, cases: started.cases, k: 5 });
  });
}

export async function gradeAttempt(req: AuthedRequest, res: Response) {
  const parsed = z.object({ outputs: z.array(caseOutputSchema).max(60), usage: usageSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The run's results couldn't be read" });
    return;
  }
  await withLabErrors(res, async () => {
    const graded = await lab.gradeAttempt(req.userId!, req.params.id, parsed.data.outputs);
    if (!graded) return notFound(res, "Run");
    const { attempt, graded: g, levelUp } = graded;
    // Practice runs show every question's details; held-out runs show only the totals, so they stay unseen.
    res.json({
      attempt: { id: attempt.id, level: attempt.level, kind: attempt.kind },
      passed: g.passed,
      levelUp,
      checks: g.checks,
      summary: g.summary,
      usage: parsed.data.usage,
      results: attempt.kind === "PRACTICE" ? g.results : null,
    });
  });
}

// ---- The `ip` toolkit the learner's bot calls from the browser ----

export async function sdkEmbed(req: AuthedRequest, res: Response) {
  if (!embeddingsEnabled()) {
    res.status(503).json({ error: "Embeddings aren't set up on this server (no Gemini key)." });
    return;
  }
  const parsed = z
    .object({ texts: z.array(z.string().min(1).max(8000)).min(1).max(100), kind: z.enum(["document", "query"]) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ip.embed takes 1 to 100 non-empty texts of up to 8,000 characters each, and kind \"document\" or \"query\"" });
    return;
  }
  let overBudget = false;
  let charged = 0;
  const { vectors, cached } = await embedTexts(parsed.data.texts, parsed.data.kind, async (count) => {
    if (req.isAdmin) return;
    if (!(await spendBudget("rag-embed-day", req.userId!, count, EMBEDDED_TEXTS_PER_DAY))) {
      overBudget = true;
      throw new lab.LabError(429, "over budget");
    }
    charged = count;
  }).catch(async (err) => {
    if (overBudget) return { vectors: null, cached: 0 };
    // Texts that failed to embed don't count against the budget.
    if (charged) await refundBudget("rag-embed-day", req.userId!, charged);
    throw err;
  });
  if (!vectors) {
    res.status(429).json({ error: `You've embedded today's ${EMBEDDED_TEXTS_PER_DAY} new texts. Re-running the same texts is free; new ones resume tomorrow.` });
    return;
  }
  res.json({ vectors: vectors.map((v) => v.map((x) => Math.round(x * 1e6) / 1e6)), cached });
}

export async function sdkLlm(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      messages: z
        .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(20000) }))
        .min(1)
        .max(40)
        .refine((m) => m.reduce((n, x) => n + x.content.length, 0) <= 60000, "too long")
        .refine((m) => m.some((x) => x.role !== "system"), "needs a user message"),
      json: z.boolean().default(false),
      temperature: z.number().min(0).max(1.5).default(0.2),
      maxTokens: z.number().int().min(1).max(1500).default(800),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "ip.llm takes 1 to 40 messages ({ role: system | user | assistant, content }), at least one of them not a system message, up to 60,000 characters in total, temperature 0-1.5 and maxTokens up to 1,500",
    });
    return;
  }
  const { messages, json, temperature, maxTokens } = parsed.data;
  if (!req.isAdmin && !(await spendBudget("rag-llm-day", req.userId!, 1, LLM_CALLS_PER_DAY))) {
    res.status(429).json({ error: `Your bot has used today's ${LLM_CALLS_PER_DAY} model calls. They reset tomorrow.` });
    return;
  }
  try {
    res.json(await retryOnRateLimit(() => labProvider.chat(messages, { json, temperature, maxTokens })));
  } catch (err) {
    console.error("RAG Lab llm call failed:", err);
    if (!req.isAdmin) await refundBudget("rag-llm-day", req.userId!, 1);
    res.status(502).json({ error: "The model call failed. Try again in a moment." });
  }
}
