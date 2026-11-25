import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { poolServing } from "./settings";

// Serving questions from the shared pool. Every function here returns null when the pool is switched off, has
// nothing suitable, or anything goes wrong (a database error, an item whose payload doesn't check out); the caller
// then writes the question with the AI exactly as before the pool existed. Nothing here ever writes to the pool
// except the "served" counter.

// Among the user's unused items, pick at random from the least-served few, so popular items don't pile up.
const CANDIDATES = 10;

// What a question response needs to credit and vote on its pool item.
export const POOL_CREDIT = { poolItem: { select: { id: true, credit: true, sourceUrl: true, licence: true } } } as const;

export type PoolCredit = { id: string; credit: string | null; sourceUrl: string | null; licence: string | null } | null;

export function serializePool(item: PoolCredit | undefined) {
  return item ? { itemId: item.id, credit: item.credit, sourceUrl: item.sourceUrl, licence: item.licence } : null;
}

const interviewPayload = z.object({
  text: z.string().min(1).max(4000),
  type: z.enum(["VERBAL", "CODING"]),
  codeSpec: z.unknown().nullable().optional(),
});

const debugPayload = z.object({
  language: z.string(),
  level: z.string(),
  title: z.string().min(1),
  scenario: z.string(),
  buggyCode: z.string().min(1),
  spec: z.string().nullable(),
  bugs: z.string().min(2),
  referenceFix: z.string().min(1),
});

const designPayload = z.object({
  level: z.string(),
  title: z.string().min(1),
  brief: z.string().min(1),
  requirements: z.string(),
  hints: z.string(),
  keyPoints: z.string(),
  referenceDesign: z.string(),
});

async function pick<T>(where: Prisma.PoolItemWhereInput, schema: z.ZodType<T>, prefer?: (payload: T) => boolean) {
  try {
    if (!(await poolServing())) return null;
    const rows = await prisma.poolItem.findMany({
      where: { ...where, retiredAt: null },
      orderBy: [{ served: "asc" }, { addedAt: "asc" }],
      take: prefer ? CANDIDATES * 3 : CANDIDATES,
      select: { id: true, payload: true },
    });
    const valid = rows.flatMap((r) => {
      const parsed = schema.safeParse(safeJson(r.payload));
      if (!parsed.success) console.error(`Pool item ${r.id} has a payload that doesn't check out; skipping it.`);
      return parsed.success ? [{ id: r.id, payload: parsed.data }] : [];
    });
    const preferred = prefer ? valid.filter((v) => prefer(v.payload)) : valid;
    const choices = (preferred.length ? preferred : valid).slice(0, CANDIDATES);
    if (!choices.length) return null;
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    await prisma.poolItem.update({ where: { id: chosen.id }, data: { served: { increment: 1 } } });
    return chosen;
  } catch (err) {
    console.error("Couldn't serve from the pool, writing with the AI instead:", err);
    return null;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A quick-practice interview question on a preset topic the user hasn't been asked before (in any session).
// `preferCoding` keeps the usual mix; if the pool has only the other type, that's used.
export function pickInterview(p: { userId: string; track: string; topic: string; level: string; preferCoding: boolean }) {
  return pick(
    { kind: "INTERVIEW", track: p.track, topic: p.topic, level: p.level, questions: { none: { session: { userId: p.userId } } } },
    interviewPayload,
    (q) => (q.type === "CODING") === p.preferCoding && (q.type !== "CODING" || hasTests(q.codeSpec))
  ).then((item) => {
    // A coding item must carry runnable tests; one that doesn't is asked as a spoken question.
    if (item && item.payload.type === "CODING" && !hasTests(item.payload.codeSpec)) item.payload = { ...item.payload, type: "VERBAL", codeSpec: null };
    return item;
  });
}

function hasTests(spec: unknown) {
  return !!spec && typeof spec === "object" && Array.isArray((spec as { tests?: unknown }).tests) && (spec as { tests: unknown[] }).tests.length > 0;
}

// A Debug exercise in this language and level the user hasn't had.
export function pickDebug(p: { userId: string; language: string; level: string }) {
  return pick({ kind: "DEBUG", language: p.language, level: p.level, debugs: { none: { userId: p.userId } } }, debugPayload, (d) => d.language === p.language && d.level === p.level);
}

// A System design question at this level the user hasn't had.
export function pickDesign(p: { userId: string; level: string }) {
  return pick({ kind: "DESIGN", level: p.level, designs: { none: { userId: p.userId } } }, designPayload, (d) => d.level === p.level);
}
