import { bankEntryForRounds } from "./story.service";
import { Prisma } from "@prisma/client";
import { DRILL_KINDS } from "./story.drills";
import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { parseJsonArray } from "../utils/json";
import { BankStory, COMPETENCIES, Competency, bankSuggestionPrompt, bankSuggestionSchema, fitPrompt, fitSchema } from "./bank.prompts";

export const MAX_BANK_ENTRIES = 30;

export type BankEntryRow = Awaited<ReturnType<typeof listEntries>>[number];

export function listEntries(userId: string) {
  return prisma.storyBankEntry.findMany({ where: { userId }, orderBy: [{ updatedAt: "desc" }] });
}

export function toBankStory(e: { id: string; title: string; summary: string; tags: string }): BankStory {
  return { id: e.id, title: e.title, summary: e.summary, tags: parseJsonArray<string>(e.tags) };
}

// How many stories cover each competency, so the page can show the gaps.
export function coverage(entries: { tags: string }[]) {
  return COMPETENCIES.map((c) => ({ ...c, count: entries.filter((e) => parseJsonArray<string>(e.tags).includes(c.key)).length }));
}

function bestTake(story: { takes: { score: number; transcript: string }[] }) {
  return [...story.takes].sort((a, b) => b.score - a.score)[0] ?? null;
}

// Drills and conversations practise skills rather than a personal story told whole, so they can't be banked.
const NOT_BANKABLE: string[] = [...DRILL_KINDS, "CONVERSATION"];

// The AI suggests a title, summary and tags, from a Speak story's best take or typed text. Nothing is saved.
export async function suggest(userId: string, input: { storyId?: string; text?: string }) {
  let text = input.text ?? "";
  if (input.storyId) {
    const story = await prisma.storyPractice.findFirst({ where: { id: input.storyId, userId, kind: { notIn: NOT_BANKABLE } }, include: { takes: { select: { score: true, transcript: true } } } });
    if (!story) return null;
    const best = bestTake(story);
    if (!best) return "noTakes" as const;
    text = `Prompt: ${story.prompt}\n\nWhat they said: ${best.transcript}`;
  }
  return generateValidated(bankSuggestionPrompt(text), bankSuggestionSchema);
}

export async function createEntry(userId: string, input: { storyId?: string; title: string; summary: string; tags: Competency[] }) {
  if ((await prisma.storyBankEntry.count({ where: { userId } })) >= MAX_BANK_ENTRIES) return "full" as const;
  let bestScore: number | null = null;
  if (input.storyId) {
    const story = await prisma.storyPractice.findFirst({ where: { id: input.storyId, userId, kind: { notIn: NOT_BANKABLE } }, include: { takes: { select: { score: true, transcript: true } } } });
    if (!story) return null;
    // One entry per story, across all its rounds.
    if (await bankEntryForRounds(story.id)) return "exists" as const;
    bestScore = bestTake(story)?.score ?? null;
  }
  try {
    return await prisma.storyBankEntry.create({
      data: { userId, storyId: input.storyId ?? null, title: input.title, summary: input.summary, tags: JSON.stringify(input.tags), bestScore },
    });
  } catch (err) {
    // One entry per Speak story.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "exists" as const;
    throw err;
  }
}

export async function updateEntry(userId: string, id: string, input: { title: string; summary: string; tags: Competency[] }) {
  const updated = await prisma.storyBankEntry.updateMany({ where: { id, userId }, data: { title: input.title, summary: input.summary, tags: JSON.stringify(input.tags) } });
  return updated.count === 1 ? prisma.storyBankEntry.findUnique({ where: { id } }) : null;
}

export async function deleteEntry(userId: string, id: string) {
  return (await prisma.storyBankEntry.deleteMany({ where: { id, userId } })).count === 1;
}

// "Which story fits?": one AI call judges the pick against the whole bank.
export async function judgeFit(userId: string, question: string, entryId: string | null) {
  const entries = await listEntries(userId);
  const chosen = entryId ? entries.find((e) => e.id === entryId) : null;
  if (entryId && !chosen) return null;
  const bank = entries.map(toBankStory);
  const fit = await generateValidated(fitPrompt({ question, chosen: chosen ? toBankStory(chosen) : null, bank }), fitSchema);
  // Only point at stories the user really has, and never at the one they picked.
  const better = fit.betterId && fit.betterId !== entryId ? entries.find((e) => e.id === fit.betterId) : undefined;
  return { ...fit, verdict: chosen ? fit.verdict : "NONE", betterId: better?.id ?? null, betterTitle: better?.title ?? null };
}

// Mock reports: count the stories a behavioural answer used. Ids are checked against the user's own bank.
export async function recordUse(userId: string, entryIds: string[]) {
  if (!entryIds.length) return;
  await prisma.storyBankEntry.updateMany({ where: { userId, id: { in: [...new Set(entryIds)] } }, data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() } });
}
