import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import * as terms from "./terms.service";
import { recordPractice } from "../today/practice.service";

function notFound(res: Response) {
  res.status(404).json({ error: "Term not found" });
}

async function withTermErrors(res: Response, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof terms.TermsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function getSummary(req: AuthedRequest, res: Response) {
  res.json({ summary: await terms.summary(req.userId!) });
}

export async function listTerms(req: AuthedRequest, res: Response) {
  const [list, summary] = await Promise.all([terms.listMyTerms(req.userId!), terms.summary(req.userId!)]);
  res.json({ terms: list, summary });
}

export async function listDecks(req: AuthedRequest, res: Response) {
  res.json({ decks: await terms.listDecks(req.userId!) });
}

export async function addDeck(req: AuthedRequest, res: Response) {
  await withTermErrors(res, async () => {
    const result = await terms.addDeck(req.userId!, String(req.params.deck).slice(0, 60));
    if (!result) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    res.status(201).json(result);
  });
}

export async function generateDeck(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ topic: z.string().trim().min(2).max(120), level: z.nativeEnum(Difficulty).nullish() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Type a topic (2 to 120 characters)" });
    return;
  }
  await withTermErrors(res, async () => {
    res.status(201).json(await terms.generateDeck(req.userId!, parsed.data.topic, parsed.data.level ?? null));
  });
}

export async function addTerm(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({
      term: z.string().trim().min(1).max(60),
      context: z
        .string()
        .trim()
        .max(200)
        .nullish()
        .transform((v) => v || null),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Type a term (up to 60 characters) and, optionally, where you heard it (up to 200)" });
    return;
  }
  await withTermErrors(res, async () => {
    res.status(201).json({ term: await terms.addTerm(req.userId!, parsed.data.term, parsed.data.context) });
  });
}

export async function removeTerm(req: AuthedRequest, res: Response) {
  if (!(await terms.removeTerm(req.userId!, req.params.id))) return notFound(res);
  res.json({ ok: true });
}

export async function nextCard(req: AuthedRequest, res: Response) {
  res.json(await terms.nextCard(req.userId!, req.query.ahead === "1"));
}

export async function answerRecognise(req: AuthedRequest, res: Response) {
  const parsed = z.object({ chosen: z.string().max(400) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick one of the options" });
    return;
  }
  await withTermErrors(res, async () => {
    const out = await terms.answerRecognise(req.userId!, req.params.termId, parsed.data.chosen);
    if (!out) return notFound(res);
    res.json({ ...out, rewards: await recordPractice(req.userId!, "TERMS") });
  });
}

export async function revealRecall(req: AuthedRequest, res: Response) {
  await withTermErrors(res, async () => {
    const out = await terms.revealRecall(req.userId!, req.params.termId);
    if (!out) return notFound(res);
    res.json({ reveal: out });
  });
}

export async function answerRecallSelf(req: AuthedRequest, res: Response) {
  const parsed = z.object({ result: z.enum(["RIGHT", "PARTLY", "WRONG"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Rate your answer: got it, partly or missed" });
    return;
  }
  await withTermErrors(res, async () => {
    const out = await terms.answerRecallSelf(req.userId!, req.params.termId, parsed.data.result);
    if (!out) return notFound(res);
    res.json({ ...out, rewards: await recordPractice(req.userId!, "TERMS") });
  });
}

const spoken = z.string().trim().min(3, "Say or type your answer first").max(4000, "That's longer than 4,000 characters");

export async function markRecall(req: AuthedRequest, res: Response) {
  const parsed = z.object({ answer: spoken }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Write your explanation first" });
    return;
  }
  await withTermErrors(res, async () => {
    const out = await terms.markRecall(req.userId!, req.params.termId, parsed.data.answer);
    if (!out) return notFound(res);
    res.json({ ...out, rewards: await recordPractice(req.userId!, "TERMS") });
  });
}

export async function answerUse(req: AuthedRequest, res: Response) {
  const parsed = z.object({ transcript: spoken }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Answer the question first" });
    return;
  }
  await withTermErrors(res, async () => {
    const out = await terms.answerUse(req.userId!, req.params.termId, parsed.data.transcript);
    if (!out) return notFound(res);
    res.json({ ...out, rewards: await recordPractice(req.userId!, "TERMS") });
  });
}
