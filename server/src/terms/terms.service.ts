import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { parseJsonArray } from "../utils/json";
import { BOX_INTERVAL_DAYS, MAX_BOX, daysFromNow, shuffle } from "../utils/spacedRepetition";
import {
  TermContent,
  deckPrompt,
  deckSchema,
  recallMarkPrompt,
  recallMarkSchema,
  singleTermPrompt,
  singleTermSchema,
  useItMarkPrompt,
  useItMarkSchema,
} from "./terms.prompts";

export type Result = "RIGHT" | "PARTLY" | "WRONG";
export type Mode = "RECOGNISE" | "RECALL" | "USE";

export const NEW_PER_DAY = 5;
const MAX_TERMS = 500;

export class TermsError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const modeForBox = (box: number): Mode => (box <= 1 ? "RECOGNISE" : box >= MAX_BOX ? "USE" : "RECALL");

// The box rule: right moves up (past the last box masters the term), partly stays, wrong moves down one. Anything
// that isn't a clean "right" comes back tomorrow.
export function nextBox(box: number, result: Result): { box: number; dueInDays: number; mastered: boolean } {
  if (result === "RIGHT") {
    if (box >= MAX_BOX) return { box, dueInDays: 0, mastered: true };
    return { box: box + 1, dueInDays: BOX_INTERVAL_DAYS[box + 1], mastered: false };
  }
  return { box: result === "PARTLY" ? box : Math.max(1, box - 1), dueInDays: BOX_INTERVAL_DAYS[1], mastered: false };
}

const startOfTodayUtc = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const normalise = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

function termData(c: TermContent) {
  return {
    term: c.term,
    oneLiner: c.oneLiner,
    explanation: c.explanation,
    example: c.example,
    keyPoints: JSON.stringify(c.keyPoints),
    confusedWith: c.confusedWith,
    interviewQuestion: c.interviewQuestion,
    distractors: JSON.stringify(c.distractors),
  };
}

async function myTermNames(userId: string) {
  const rows = await prisma.termProgress.findMany({ where: { userId }, select: { term: { select: { term: true } } } });
  return rows.map((r) => r.term.term);
}

// ---- Lists and decks ----

export async function summary(userId: string) {
  const now = new Date();
  const [total, mastered, due, introducedToday, unseen, reviewedToday] = await Promise.all([
    prisma.termProgress.count({ where: { userId } }),
    prisma.termProgress.count({ where: { userId, masteredAt: { not: null } } }),
    prisma.termProgress.count({ where: { userId, masteredAt: null, introducedAt: { not: null }, dueAt: { lte: now } } }),
    prisma.termProgress.count({ where: { userId, introducedAt: { gte: startOfTodayUtc() } } }),
    prisma.termProgress.count({ where: { userId, masteredAt: null, introducedAt: null } }),
    prisma.termProgress.count({ where: { userId, reviewedAt: { gte: startOfTodayUtc() } } }),
  ]);
  return { total, mastered, due, newToday: Math.min(unseen, Math.max(0, NEW_PER_DAY - introducedToday)), reviewedToday };
}

export async function listMyTerms(userId: string) {
  const rows = await prisma.termProgress.findMany({ where: { userId }, include: { term: true }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.term.id,
    term: r.term.term,
    deck: r.term.deck,
    source: r.term.source,
    oneLiner: r.term.oneLiner,
    explanation: r.term.explanation,
    example: r.term.example,
    keyPoints: parseJsonArray<string>(r.term.keyPoints),
    confusedWith: r.term.confusedWith,
    interviewQuestion: r.term.interviewQuestion,
    box: r.box,
    mode: modeForBox(r.box),
    isNew: r.introducedAt === null,
    mastered: r.masteredAt !== null,
    dueAt: r.dueAt,
  }));
}

export async function listDecks(userId: string) {
  const [presets, mine] = await Promise.all([
    prisma.term.groupBy({ by: ["deck"], where: { source: "PRESET" }, _count: { _all: true }, orderBy: { deck: "asc" } }),
    prisma.termProgress.groupBy({ by: ["termId"], where: { userId, term: { source: "PRESET" } } }),
  ]);
  const added = new Set(mine.map((m) => m.termId));
  const presetTerms = await prisma.term.findMany({ where: { source: "PRESET" }, select: { id: true, deck: true } });
  return presets.map((d) => ({
    deck: d.deck,
    terms: d._count._all,
    added: presetTerms.filter((t) => t.deck === d.deck && added.has(t.id)).length,
  }));
}

// Adds a starter deck's terms to the list, skipping ones already there (by id, or by name from another source).
export async function addDeck(userId: string, deck: string) {
  const terms = await prisma.term.findMany({ where: { source: "PRESET", deck }, select: { id: true, term: true } });
  if (!terms.length) return null;
  const have = new Set((await myTermNames(userId)).map(normalise));
  const toAdd = terms.filter((t) => !have.has(normalise(t.term)));
  if (have.size + toAdd.length > MAX_TERMS) throw new TermsError(409, `You can have up to ${MAX_TERMS} terms. Remove some first.`);
  const created = await prisma.termProgress.createMany({
    data: toAdd.map((t) => ({ userId, termId: t.id, dueAt: new Date() })),
    skipDuplicates: true,
  });
  return { added: created.count };
}

export async function generateDeck(userId: string, topic: string, level: string | null) {
  const existing = await myTermNames(userId);
  if (existing.length >= MAX_TERMS) throw new TermsError(409, `You can have up to ${MAX_TERMS} terms. Remove some first.`);
  const { terms } = await generateValidated(deckPrompt({ topic, level, existing }), deckSchema);
  const seen = new Set(existing.map(normalise));
  const fresh = terms.filter((t) => {
    const key = normalise(t.term);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const deck = topic.slice(0, 60);
  await prisma.$transaction(
    fresh.map((c) =>
      prisma.term.create({
        data: { ...termData(c), userId, deck, source: "AI", progress: { create: { userId, dueAt: new Date() } } },
      })
    )
  );
  return { added: fresh.length, skipped: terms.length - fresh.length, deck };
}

export async function addTerm(userId: string, term: string, context: string | null) {
  const existing = await myTermNames(userId);
  const have = new Set(existing.map(normalise));
  if (have.has(normalise(term))) throw new TermsError(409, `"${term}" is already in your terms.`);
  if (existing.length >= MAX_TERMS) throw new TermsError(409, `You can have up to ${MAX_TERMS} terms. Remove some first.`);
  const res = await generateValidated(singleTermPrompt({ term, context }), singleTermSchema);
  if (!res.known) throw new TermsError(422, res.reason || `"${term}" doesn't look like a technical term.`);
  if (have.has(normalise(res.content.term))) throw new TermsError(409, `"${res.content.term}" is already in your terms.`);
  return prisma.term.create({
    data: { ...termData(res.content), userId, deck: res.deck, source: "MANUAL", progress: { create: { userId, dueAt: new Date() } } },
    select: { id: true, term: true },
  });
}

// Removes a term from the list. The user's own terms are deleted; starter-deck terms are shared, so only the
// progress row goes.
export async function removeTerm(userId: string, termId: string) {
  const progress = await prisma.termProgress.findUnique({ where: { userId_termId: { userId, termId } }, include: { term: { select: { userId: true } } } });
  if (!progress) return false;
  if (progress.term.userId === userId) await prisma.term.deleteMany({ where: { id: termId, userId } });
  else await prisma.termProgress.deleteMany({ where: { id: progress.id } });
  return true;
}

// ---- Review ----

async function recogniseOptions(term: { id: string; deck: string; oneLiner: string; distractors: string; userId: string | null }) {
  // Other terms from the same deck make the most plausible wrong options; the stored distractors fill any gap.
  const others = await prisma.term.findMany({
    where: { deck: term.deck, id: { not: term.id }, OR: [{ userId: null }, { userId: term.userId }] },
    select: { oneLiner: true },
    take: 40,
  });
  const pool = shuffle(others.map((o) => o.oneLiner)).slice(0, 3);
  for (const d of parseJsonArray<string>(term.distractors)) if (pool.length < 3 && !pool.includes(d)) pool.push(d);
  return shuffle([term.oneLiner, ...pool.slice(0, 3)]);
}

// The next card: a due term first, then a new one if today's new-term allowance isn't used up. With `ahead`, a
// not-yet-due term instead (answers to it never move it).
export async function nextCard(userId: string, ahead: boolean) {
  const now = new Date();
  let progress = await prisma.termProgress.findFirst({
    where: { userId, masteredAt: null, introducedAt: { not: null }, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    include: { term: true },
  });
  const s = await summary(userId);
  if (!progress && s.newToday > 0) {
    progress = await prisma.termProgress.findFirst({ where: { userId, masteredAt: null, introducedAt: null }, orderBy: { createdAt: "asc" }, include: { term: true } });
  }
  let practisingAhead = false;
  if (!progress && ahead) {
    const pool = await prisma.termProgress.findMany({ where: { userId, masteredAt: null, introducedAt: { not: null } }, include: { term: true }, take: 50 });
    progress = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    practisingAhead = !!progress;
  }
  if (!progress) return { card: null, summary: s };
  const t = progress.term;
  const mode = modeForBox(progress.box);
  return {
    summary: s,
    card: {
      termId: t.id,
      term: t.term,
      deck: t.deck,
      box: progress.box,
      mode,
      isNew: progress.introducedAt === null,
      practisingAhead,
      // Recognise shows options only; Recall shows the term; Use it shows the question. The answer comes back after.
      options: mode === "RECOGNISE" ? await recogniseOptions(t) : null,
      withExample: progress.box === 3,
      interviewQuestion: mode === "USE" ? t.interviewQuestion : null,
    },
  };
}

function reveal(t: { term: string; oneLiner: string; explanation: string; example: string; keyPoints: string; confusedWith: string | null }) {
  return { term: t.term, oneLiner: t.oneLiner, explanation: t.explanation, example: t.example, keyPoints: parseJsonArray<string>(t.keyPoints), confusedWith: t.confusedWith };
}

async function loadForAnswer(userId: string, termId: string, mode: Mode) {
  const progress = await prisma.termProgress.findUnique({ where: { userId_termId: { userId, termId } }, include: { term: true } });
  if (!progress) return null;
  if (progress.masteredAt) throw new TermsError(409, "You've already mastered this term.");
  if (modeForBox(progress.box) !== mode) throw new TermsError(409, "This term has moved on. Load the next card.");
  return progress;
}

// Applies a result. Only a due (or new) term moves, and the conditional write means a double submit or a second tab
// can't move it twice.
async function apply(progress: { id: string; box: number; dueAt: Date; introducedAt: Date | null }, result: Result) {
  const now = new Date();
  const due = progress.introducedAt === null || progress.dueAt <= now;
  if (!due) return { moved: false, box: progress.box, mastered: false, nextReviewDays: Math.ceil((progress.dueAt.getTime() - now.getTime()) / 86_400_000) };
  const next = nextBox(progress.box, result);
  const written = await prisma.termProgress.updateMany({
    where: { id: progress.id, box: progress.box, dueAt: progress.dueAt, masteredAt: null },
    data: {
      box: next.box,
      dueAt: daysFromNow(next.dueInDays),
      masteredAt: next.mastered ? now : null,
      introducedAt: progress.introducedAt ?? now,
      lastResult: result,
      reviewedAt: now,
    },
  });
  if (written.count !== 1) return { moved: false, box: progress.box, mastered: false, nextReviewDays: null };
  return { moved: true, box: next.box, mastered: next.mastered, nextReviewDays: next.mastered ? null : next.dueInDays };
}

export async function answerRecognise(userId: string, termId: string, chosen: string) {
  const progress = await loadForAnswer(userId, termId, "RECOGNISE");
  if (!progress) return null;
  const result: Result = chosen.trim() === progress.term.oneLiner.trim() ? "RIGHT" : "WRONG";
  return { result, ...(await apply(progress, result)), reveal: reveal(progress.term) };
}

// The model answer for a Recall card, so the learner can rate themselves against it. Doesn't move the term.
export async function revealRecall(userId: string, termId: string) {
  const progress = await loadForAnswer(userId, termId, "RECALL");
  return progress ? reveal(progress.term) : null;
}

export async function answerRecallSelf(userId: string, termId: string, result: Result) {
  const progress = await loadForAnswer(userId, termId, "RECALL");
  if (!progress) return null;
  return { result, ...(await apply(progress, result)), reveal: reveal(progress.term) };
}

export async function markRecall(userId: string, termId: string, answer: string) {
  const progress = await loadForAnswer(userId, termId, "RECALL");
  if (!progress) return null;
  const t = progress.term;
  const mark = await generateValidated(
    recallMarkPrompt({ term: t.term, oneLiner: t.oneLiner, keyPoints: parseJsonArray<string>(t.keyPoints), withExample: progress.box === 3, answer }),
    recallMarkSchema
  );
  return { result: mark.result, note: mark.note, ...(await apply(progress, mark.result)), reveal: reveal(t) };
}

// Whether the term appears in the transcript, allowing other forms of the same word: "idempotency" matches
// "idempotent", "caching" matches "cache", hyphens and spaces are interchangeable. Words are cut to a stem (at least
// 4 letters) and any ending is accepted after it.
const SUFFIXES = ["ations", "ation", "encies", "ency", "ence", "ents", "ent", "ances", "ance", "ant", "ities", "ity", "ness", "ers", "er", "ing", "ies", "ed", "es", "s", "y", "e"];

function wordPattern(word: string) {
  let stem = word;
  if (word.length >= 6) {
    const suffix = SUFFIXES.find((x) => word.endsWith(x) && word.length - x.length >= 4);
    if (suffix) stem = word.slice(0, -suffix.length);
  }
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return stem === word ? `${escaped}(s|es|ies)?` : `${escaped}[a-z]*`;
}

export function termAppears(term: string, transcript: string) {
  const words = term
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!words.length) return false;
  const pattern = words.map(wordPattern).join("[\\s-]*");
  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`).test(transcript.toLowerCase());
}

export async function answerUse(userId: string, termId: string, transcript: string) {
  const progress = await loadForAnswer(userId, termId, "USE");
  if (!progress) return null;
  const t = progress.term;
  const appears = termAppears(t.term, transcript);
  const mark = await generateValidated(
    useItMarkPrompt({ term: t.term, oneLiner: t.oneLiner, question: t.interviewQuestion, transcript, termAppears: appears }),
    useItMarkSchema
  );
  // Passing needs the term used correctly, whatever else the marker says.
  const result: Result = mark.usedCorrectly ? mark.result : "WRONG";
  return {
    result,
    termAppears: appears,
    precision: mark.precision,
    fix: mark.fix,
    modelSentence: mark.modelSentence,
    ...(await apply(progress, result)),
    reveal: reveal(t),
  };
}
