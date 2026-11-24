import { prisma } from "../db/prisma";
import { trendsAgeDays, UPDATED_ON } from "../ai/interviewTrends";
import { BATCH, classify } from "./classify";
import { fillSlot, insert, presetTopics, slots } from "./fill";
import { fileUrl, latestCommit, licenceAt, markdownFilesIn, rawFile } from "./github";
import { isAllowedLicence, POOL_SOURCES, questionChecksum, sectionBullets } from "./sources";

// "Update questions": the admin's run that refreshes the pool. It runs as small steps the admin page calls one after
// another, each doing at most one AI call, so no request hits the serverless time limit. A run:
//   sources  -> check each GitHub source for a new commit and an allowed licence; queue its files
//   import   -> read one queued file per step; collect questions not already in the pool
//   classify -> sort up to 20 collected questions per step into preset topics and levels (1 AI call), and add them
//   improve  -> retire items most people marked "Not realistic"
//   fill     -> write one item per step for the thinnest slot (1 AI call), until every slot is full or the cap is hit
// Only one run at a time: a run holds the lock while its heartbeat is fresh; a run silent for LOCK_MS is abandoned.

export const DEFAULT_AI_CAP = 40;
const LOCK_MS = 10 * 60_000;
const MAX_LOG = 200;
const MAX_PENDING = 400;
const MAX_FILL_FAILURES = 5;
// Retire an item when at least this many people voted and this share said "Not realistic".
export const RETIRE_MIN_VOTES = 3;
export const RETIRE_SHARE = 0.6;

type Phase = "sources" | "import" | "classify" | "improve" | "fill" | "done";

interface Pending {
  text: string;
  sourceId: string;
  url: string;
  credit: string;
  licence: string;
}

interface RunState {
  phase: Phase;
  cap: number;
  queue: { sourceId: string; ref: string; path: string }[];
  pending: Pending[];
  // Commits being imported; saved to PoolSource only once their questions have all been sorted.
  commits: Record<string, string>;
  fillFailures: number;
}

type Run = NonNullable<Awaited<ReturnType<typeof prisma.poolUpdate.findUnique>>>;

function readState(run: Run): RunState {
  const s = JSON.parse(run.state || "{}") as Partial<RunState>;
  return { phase: s.phase ?? "sources", cap: s.cap ?? DEFAULT_AI_CAP, queue: s.queue ?? [], pending: s.pending ?? [], commits: s.commits ?? {}, fillFailures: s.fillFailures ?? 0 };
}

export async function startRun(cap = DEFAULT_AI_CAP) {
  const now = Date.now();
  await prisma.poolUpdate.updateMany({ where: { status: "RUNNING", heartbeat: { lt: new Date(now - LOCK_MS) } }, data: { status: "ABANDONED", finishedAt: new Date() } });
  const running = await prisma.poolUpdate.findFirst({ where: { status: "RUNNING" }, orderBy: { startedAt: "asc" } });
  if (running) return { busy: true as const, run: running };
  const state: RunState = { phase: "sources", cap, queue: [], pending: [], commits: {}, fillFailures: 0 };
  const lines = trendsAgeDays() > 120 ? [`Note: the interview trends list is from ${UPDATED_ON}; it's due a review (ai/interviewTrends.ts).`] : [];
  const created = await prisma.poolUpdate.create({ data: { state: JSON.stringify(state), log: JSON.stringify(lines) } });
  // Two starts at the same moment: the earlier run keeps the lock, the later one stands down.
  const first = await prisma.poolUpdate.findFirst({ where: { status: "RUNNING" }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  if (first && first.id !== created.id) {
    await prisma.poolUpdate.update({ where: { id: created.id }, data: { status: "ABANDONED", finishedAt: new Date() } });
    return { busy: true as const, run: first };
  }
  return { busy: false as const, run: created };
}

export async function cancelRun(id: string) {
  await prisma.poolUpdate.updateMany({ where: { id, status: "RUNNING" }, data: { status: "CANCELLED", finishedAt: new Date() } });
  return prisma.poolUpdate.findUnique({ where: { id } });
}

// One unit of work. Returns the run as it stands after the step. A step that another tab is already running (the
// heartbeat moved under us) does nothing and says so.
export async function step(id: string): Promise<{ run: Run | null; busy?: boolean }> {
  const run = await prisma.poolUpdate.findUnique({ where: { id } });
  if (!run || run.status !== "RUNNING") return { run };
  // Claim this step: only the request that moves the heartbeat from the value it read may work on the run.
  const claimed = await prisma.poolUpdate.updateMany({ where: { id, status: "RUNNING", heartbeat: run.heartbeat }, data: { heartbeat: new Date() } });
  if (claimed.count !== 1) return { run, busy: true };

  const state = readState(run);
  const log: string[] = [];
  let aiCalls = 0;
  let added = 0;
  let retired = 0;
  try {
    switch (state.phase) {
      case "sources":
        log.push(...(await checkSources(state)));
        state.phase = state.queue.length ? "import" : "improve";
        break;
      case "import": {
        const next = state.queue.shift();
        if (next) log.push(await importFile(state, next));
        if (!state.queue.length) state.phase = state.pending.length ? "classify" : await finishSources(state, log);
        break;
      }
      case "classify": {
        if (run.aiCalls >= state.cap) {
          log.push(`Stopped: reached the limit of ${state.cap} AI calls for this run. Run the update again to continue.`);
          state.phase = "done";
          break;
        }
        const batch = state.pending.splice(0, BATCH);
        const sorted = await classify(
          batch.map((b) => b.text),
          await presetTopics()
        );
        aiCalls++;
        for (const q of sorted) {
          const src = batch[q.index];
          const ok = await insert({
            kind: "INTERVIEW",
            level: q.level,
            track: q.track,
            topic: q.topic,
            checksumText: q.text,
            payload: { text: q.text, type: "VERBAL", codeSpec: null },
            source: `github:${src.sourceId}`,
            sourceUrl: src.url,
            licence: src.licence,
            credit: src.credit,
          });
          if (ok) added++;
        }
        log.push(`Sorted ${batch.length} imported questions: ${added} added, ${batch.length - sorted.length} didn't fit a preset topic.`);
        if (!state.pending.length) state.phase = await finishSources(state, log);
        break;
      }
      case "improve":
        retired = await retireUnrealistic();
        log.push(retired ? `Retired ${retired} item(s) most people marked "Not realistic".` : `No items to retire.`);
        state.phase = "fill";
        break;
      case "fill": {
        if (run.aiCalls >= state.cap) {
          log.push(`Stopped: reached the limit of ${state.cap} AI calls for this run. Run the update again to continue.`);
          state.phase = "done";
          break;
        }
        const thin = (await slots()).find((s) => s.have < s.target);
        if (!thin) {
          log.push("Every slot is full.");
          state.phase = "done";
          break;
        }
        try {
          const result = await fillSlot(thin);
          aiCalls += result.aiCalls;
          if (result.added) added++;
          state.fillFailures = 0;
          log.push(result.message);
        } catch (err) {
          aiCalls++;
          state.fillFailures++;
          log.push(`Couldn't write an item (${err instanceof Error ? err.message.slice(0, 120) : "error"}).`);
          if (state.fillFailures >= MAX_FILL_FAILURES) {
            log.push(`Stopped after ${MAX_FILL_FAILURES} failures in a row; the AI providers may be out of quota. Try again later.`);
            state.phase = "done";
          }
        }
        break;
      }
      case "done":
        break;
    }
  } catch (err) {
    // A failed step is logged, never fatal: the run moves on (a failed source was already skipped by its phase).
    log.push(`Step failed in ${state.phase}: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`);
    if (state.phase === "classify") state.phase = await finishSources(state, log);
  }

  const oldLog = JSON.parse(run.log || "[]") as string[];
  const done = state.phase === "done";
  // Only while still running: if the admin pressed Stop during this step, the stop stands (the counts still record
  // what the step did).
  await prisma.poolUpdate.updateMany({
    where: { id, status: "RUNNING" },
    data: {
      state: JSON.stringify(state),
      log: JSON.stringify([...oldLog, ...log].slice(-MAX_LOG)),
      aiCalls: { increment: aiCalls },
      added: { increment: added },
      retired: { increment: retired },
      heartbeat: new Date(),
      ...(done ? { status: "DONE", finishedAt: new Date() } : {}),
    },
  });
  return { run: await prisma.poolUpdate.findUnique({ where: { id } }) };
}

async function checkSources(state: RunState): Promise<string[]> {
  const log: string[] = [];
  for (const src of POOL_SOURCES) {
    try {
      const ref = await latestCommit(src.repo, src.folder);
      const saved = await prisma.poolSource.findUnique({ where: { id: src.id } });
      await prisma.poolSource.upsert({
        where: { id: src.id },
        create: { id: src.id, repo: src.repo, path: src.folder, licence: src.licence, checkedAt: new Date() },
        update: { checkedAt: new Date(), lastError: null },
      });
      if (saved?.lastCommit === ref) {
        log.push(`${src.label}: no changes since the last import.`);
        continue;
      }
      const licence = await licenceAt(src.repo, ref);
      if (!isAllowedLicence(licence)) {
        await prisma.poolSource.update({ where: { id: src.id }, data: { lastError: `Licence ${licence ?? "unknown"} isn't allowed` } });
        log.push(`${src.label}: refused, its licence is now ${licence ?? "unknown"} (allowed: MIT, Apache-2.0, CC0, CC-BY-4.0).`);
        continue;
      }
      const files = await markdownFilesIn(src.repo, ref, src.folder);
      state.queue.push(...files.map((path) => ({ sourceId: src.id, ref, path })));
      state.commits[src.id] = ref;
      log.push(`${src.label}: new commit ${ref.slice(0, 7)}, licence ${licence}; ${files.length} files to read.`);
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 160) : "error";
      await prisma.poolSource.updateMany({ where: { id: src.id }, data: { lastError: message } });
      log.push(`${src.label}: skipped (${message}).`);
    }
  }
  return log;
}

async function importFile(state: RunState, file: { sourceId: string; ref: string; path: string }): Promise<string> {
  const src = POOL_SOURCES.find((s) => s.id === file.sourceId);
  if (!src) return `Skipped ${file.path}: unknown source.`;
  try {
    const questions = sectionBullets(await rawFile(src.repo, file.ref, file.path), src.sections);
    if (!questions.length) return `${file.path}: no questions in the imported sections.`;
    const existing = new Set(
      (await prisma.poolItem.findMany({ where: { checksum: { in: questions.map((q) => questionChecksum("INTERVIEW", q)) } }, select: { checksum: true } })).map((r) => r.checksum)
    );
    const queued = new Set(state.pending.map((p) => questionChecksum("INTERVIEW", p.text)));
    const reported = src.reportedBy?.(file.path);
    const fresh = questions.filter((q) => {
      const sum = questionChecksum("INTERVIEW", q);
      if (existing.has(sum) || queued.has(sum)) return false;
      queued.add(sum);
      return true;
    });
    const room = Math.max(0, MAX_PENDING - state.pending.length);
    state.pending.push(
      ...fresh.slice(0, room).map((text) => ({
        text,
        sourceId: src.id,
        url: fileUrl(src.repo, file.ref, file.path),
        licence: src.licence,
        credit: `${reported ? `Reported at ${reported}. ` : ""}From the ${src.label} (${src.licence}).`,
      }))
    );
    return `${file.path}: ${questions.length} questions, ${fresh.length} new.`;
  } catch (err) {
    return `${file.path}: skipped (${err instanceof Error ? err.message.slice(0, 120) : "error"}).`;
  }
}

// Every queued question has been sorted (or the run stopped): remember the commits so the next run skips them.
async function finishSources(state: RunState, log: string[]): Promise<Phase> {
  if (!state.pending.length) {
    for (const [id, ref] of Object.entries(state.commits)) await prisma.poolSource.update({ where: { id }, data: { lastCommit: ref } });
    if (Object.keys(state.commits).length) log.push("Import finished.");
    state.commits = {};
  }
  state.pending = [];
  return "improve";
}

async function retireUnrealistic(): Promise<number> {
  const tallies = await prisma.poolVote.groupBy({ by: ["itemId", "realistic"], _count: { _all: true } });
  const byItem = new Map<string, { yes: number; no: number }>();
  for (const t of tallies) {
    const v = byItem.get(t.itemId) ?? { yes: 0, no: 0 };
    if (t.realistic) v.yes += t._count._all;
    else v.no += t._count._all;
    byItem.set(t.itemId, v);
  }
  const ids = [...byItem].filter(([, v]) => v.yes + v.no >= RETIRE_MIN_VOTES && v.no / (v.yes + v.no) >= RETIRE_SHARE).map(([id]) => id);
  if (!ids.length) return 0;
  const { count } = await prisma.poolItem.updateMany({ where: { id: { in: ids }, retiredAt: null }, data: { retiredAt: new Date() } });
  return count;
}

export async function poolStatus() {
  const [counts, runs, sources, serve] = await Promise.all([
    prisma.poolItem.groupBy({ by: ["kind", "level"], where: { retiredAt: null }, _count: { _all: true } }),
    prisma.poolUpdate.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.poolSource.findMany(),
    prisma.appSetting.findUnique({ where: { key: "pool.serve" } }),
  ]);
  const allSlots = await slots();
  return {
    serving: serve?.value === "on",
    counts: counts.map((c) => ({ kind: c.kind, level: c.level, count: c._count._all })),
    slots: { total: allSlots.length, full: allSlots.filter((s) => s.have >= s.target).length, empty: allSlots.filter((s) => s.have === 0).length },
    runs: runs.map((r) => ({ ...r, log: JSON.parse(r.log || "[]") as string[], state: undefined, phase: readState(r).phase })),
    sources: POOL_SOURCES.map((s) => ({ ...s, sections: s.sections.source, reportedBy: undefined, saved: sources.find((x) => x.id === s.id) ?? null })),
    trends: { updatedOn: UPDATED_ON, ageDays: trendsAgeDays() },
  };
}
