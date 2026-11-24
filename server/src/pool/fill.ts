import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { retryOnInvalid } from "../ai/retry";
import { trendsFor } from "../ai/interviewTrends";
import { DEBUG_LANGUAGE_KEYS, DebugLanguage } from "../debug/debug.prompts";
import { writeChallenge as writeDebug } from "../debug/debug.service";
import { writeChallenge as writeDesign } from "../design/design.service";
import { Difficulty } from "../types";
import { questionChecksum } from "./sources";

// How many live items the update aims for in each slot. Thin slots are filled first (breadth first), so a short
// update still spreads across every topic, language and level.
export const TARGETS = { INTERVIEW: 3, DEBUG: 3, DESIGN: 6 } as const;
export const LEVELS = [Difficulty.JUNIOR, Difficulty.INTERMEDIATE, Difficulty.SENIOR] as const;

export type PoolKind = keyof typeof TARGETS;

export interface Slot {
  kind: PoolKind;
  level: string;
  track?: string;
  topic?: string;
  language?: string;
  have: number;
  target: number;
}

// The preset topics (custom topics are private to their owners and never pooled).
export async function presetTopics() {
  return prisma.topic.findMany({ where: { isCustom: false, ownerId: null }, select: { name: true, track: true }, orderBy: [{ track: "asc" }, { name: "asc" }] });
}

const slotKey = (s: { kind: string; level: string; track?: string | null; topic?: string | null; language?: string | null }) =>
  [s.kind, s.level, s.track ?? "", s.topic ?? "", s.language ?? ""].join("|");

// Every slot with how many live items it has, thinnest first.
export async function slots(): Promise<Slot[]> {
  const [topics, counts] = await Promise.all([
    presetTopics(),
    prisma.poolItem.groupBy({ by: ["kind", "level", "track", "topic", "language"], where: { retiredAt: null }, _count: { _all: true } }),
  ]);
  const have = new Map(counts.map((c) => [slotKey(c), c._count._all]));
  const all: Omit<Slot, "have">[] = [];
  for (const level of LEVELS) {
    for (const t of topics) all.push({ kind: "INTERVIEW", level, track: t.track, topic: t.name, target: TARGETS.INTERVIEW });
    for (const language of DEBUG_LANGUAGE_KEYS) all.push({ kind: "DEBUG", level, language, target: TARGETS.DEBUG });
    all.push({ kind: "DESIGN", level, target: TARGETS.DESIGN });
  }
  return all
    .map((s) => ({ ...s, have: have.get(slotKey(s)) ?? 0 }))
    .sort((a, b) => a.have / a.target - b.have / b.target);
}

export type FillResult = { added: boolean; aiCalls: number; message: string };

// Writes one item for a slot, from a prompt with no user data in it. Anything that fails a check is skipped, never
// stored: a coding question without a runnable test spec, or a duplicate of an item already in the pool.
export async function fillSlot(slot: Slot): Promise<FillResult> {
  const label = [slot.kind, slot.track, slot.topic, slot.language, slot.level].filter(Boolean).join(" / ");
  if (slot.kind === "INTERVIEW") {
    const existing = await prisma.poolItem.findMany({
      where: { kind: "INTERVIEW", track: slot.track, topic: slot.topic, retiredAt: null },
      select: { payload: true },
      take: 40,
    });
    const avoid = existing.map((e) => (JSON.parse(e.payload) as { text: string }).text);
    const q = await retryOnInvalid(() =>
      aiProvider.generateQuestion({
        topic: slot.topic!,
        track: slot.track!,
        difficulty: slot.level as Difficulty,
        priorQA: [],
        forPool: { avoid, trends: trendsFor("INTERVIEW", slot.track) },
      })
    );
    if (q.type === "CODING" && !q.code) return { added: false, aiCalls: 1, message: `Skipped ${label}: a coding question without runnable tests.` };
    const added = await insert({
      kind: "INTERVIEW",
      level: slot.level,
      track: slot.track,
      topic: slot.topic,
      checksumText: q.text,
      payload: { text: q.text, type: q.type, codeSpec: q.type === "CODING" ? q.code : null },
    });
    return { added, aiCalls: 1, message: added ? `Added ${label}.` : `Skipped ${label}: already in the pool.` };
  }
  if (slot.kind === "DEBUG") {
    const titles = await poolTitles("DEBUG", slot.level, slot.language);
    const written = await writeDebug({
      language: slot.language as DebugLanguage,
      level: slot.level,
      roleTitle: null,
      recentTitles: titles,
      trends: trendsFor("DEBUG"),
    });
    const added = await insert({ kind: "DEBUG", level: slot.level, language: slot.language, checksumText: `${written.title}\n${written.buggyCode}`, payload: written });
    return { added, aiCalls: 1, message: added ? `Added ${label}: ${written.title}.` : `Skipped ${label}: already in the pool.` };
  }
  const titles = await poolTitles("DESIGN", slot.level);
  const written = await writeDesign({ level: slot.level, topic: null, roleTitle: null, recentTitles: titles, trends: trendsFor("DESIGN") });
  const added = await insert({ kind: "DESIGN", level: slot.level, checksumText: written.title, payload: written });
  return { added, aiCalls: 1, message: added ? `Added ${label}: ${written.title}.` : `Skipped ${label}: already in the pool.` };
}

async function poolTitles(kind: "DEBUG" | "DESIGN", level: string, language?: string) {
  const rows = await prisma.poolItem.findMany({ where: { kind, level, language: language ?? undefined, retiredAt: null }, select: { payload: true }, take: 30 });
  return rows.map((r) => (JSON.parse(r.payload) as { title: string }).title);
}

// Adds an item unless one with the same normalised text exists (the unique checksum settles races too).
export async function insert(p: {
  kind: PoolKind;
  level: string;
  track?: string;
  topic?: string;
  language?: string;
  checksumText: string;
  payload: unknown;
  source?: string;
  sourceUrl?: string;
  licence?: string;
  credit?: string;
}): Promise<boolean> {
  const { count } = await prisma.poolItem.createMany({
    data: [
      {
        kind: p.kind,
        level: p.level,
        track: p.track ?? null,
        topic: p.topic ?? null,
        language: p.language ?? null,
        payload: JSON.stringify(p.payload),
        checksum: questionChecksum(p.kind, p.checksumText),
        source: p.source ?? "ai",
        sourceUrl: p.sourceUrl ?? null,
        licence: p.licence ?? null,
        credit: p.credit ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}
