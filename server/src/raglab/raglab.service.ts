import { prisma } from "../db/prisma";
import { parseJsonArray } from "../utils/json";
import { CASES, CaseSet } from "./cases";
import { CaseOutput, gradeRun } from "./grader";
import { checksUpTo, PLAYABLE_LEVELS } from "./levels";
import { LabLanguage, STARTERS } from "./starters";

const MAX_PROJECTS = 10;
const STALE_GRADING_MS = 3 * 60 * 1000;

export class LabError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function listProjects(userId: string) {
  return prisma.ragProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, language: true, level: true, updatedAt: true },
  });
}

export async function createProject(userId: string, name: string, language: LabLanguage) {
  if ((await prisma.ragProject.count({ where: { userId } })) >= MAX_PROJECTS) {
    throw new LabError(409, `You can have up to ${MAX_PROJECTS} projects. Delete one to start another.`);
  }
  return prisma.ragProject.create({ data: { userId, name, language, code: STARTERS[language] } });
}

export function findProject(userId: string, id: string) {
  return prisma.ragProject.findFirst({ where: { id, userId } });
}

export function listAttempts(projectId: string) {
  return prisma.ragAttempt.findMany({
    where: { projectId, status: "DONE" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, level: true, kind: true, metrics: true, passed: true, createdAt: true },
  });
}

export async function saveCode(userId: string, id: string, code: string) {
  const updated = await prisma.ragProject.updateMany({ where: { id, userId }, data: { code } });
  return updated.count === 1;
}

export async function deleteProject(userId: string, id: string) {
  const deleted = await prisma.ragProject.deleteMany({ where: { id, userId } });
  return deleted.count === 1;
}

// The cases a run uses: every category the checks up to this level look at, from the practice or held-out set.
function casesFor(level: number, set: CaseSet) {
  const categories = new Set(checksUpTo(level).map((c) => c.category));
  return CASES.filter((tc) => tc.set === set && categories.has(tc.category));
}

// Starts a run: fixes the case list (so the graded outputs can be checked against it) and snapshots the code.
export async function startAttempt(userId: string, projectId: string, kind: CaseSet, code: string) {
  const project = await findProject(userId, projectId);
  if (!project) return null;
  if (project.level > PLAYABLE_LEVELS) throw new LabError(409, "You've passed every level available so far. New levels are on the way.");
  const cases = casesFor(project.level, kind);
  // Runs that were started but never graded (the tab was closed) are kept for an hour, then cleared.
  await prisma.ragAttempt.deleteMany({ where: { projectId, status: "RUNNING", createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
  const [attempt] = await prisma.$transaction([
    prisma.ragAttempt.create({ data: { projectId, userId, level: project.level, kind, caseIds: JSON.stringify(cases.map((c) => c.id)), code } }),
    prisma.ragProject.update({ where: { id: projectId }, data: { code } }),
  ]);
  return { attempt, cases: cases.map((c) => ({ id: c.id, question: c.question, history: c.history })) };
}

// Grades a run once: RUNNING -> GRADING is claimed first (a stale claim can be retaken), and a failed grading goes
// back to RUNNING so it can be retried. Passing a held-out run moves the project to the next level, only if it is
// still on the level that was run.
export async function gradeAttempt(userId: string, attemptId: string, outputs: CaseOutput[]) {
  const attempt = await prisma.ragAttempt.findFirst({ where: { id: attemptId, userId } });
  if (!attempt) return null;
  const caseIds = parseJsonArray<string>(attempt.caseIds);
  const sent = new Set(outputs.map((o) => o.caseId));
  if (sent.size !== outputs.length || sent.size !== caseIds.length || caseIds.some((id) => !sent.has(id))) {
    throw new LabError(400, "The results don't match the questions this run was given. Start a new run.");
  }

  const claimedAt = new Date();
  const claimed = await prisma.ragAttempt.updateMany({
    where: { id: attemptId, OR: [{ status: "RUNNING" }, { status: "GRADING", gradedAt: { lt: new Date(Date.now() - STALE_GRADING_MS) } }] },
    data: { status: "GRADING", gradedAt: claimedAt },
  });
  if (claimed.count !== 1) throw new LabError(409, "This run has already been graded.");

  try {
    const graded = await gradeRun(caseIds, outputs, checksUpTo(attempt.level));
    const metrics = { checks: graded.checks, summary: graded.summary };
    const written = await prisma.ragAttempt.updateMany({
      where: { id: attemptId, status: "GRADING", gradedAt: claimedAt },
      data: {
        status: "DONE",
        outputs: JSON.stringify(outputs),
        results: JSON.stringify(graded.results),
        metrics: JSON.stringify(metrics),
        passed: graded.passed,
        gradedAt: new Date(),
      },
    });
    let levelUp = false;
    if (written.count === 1 && attempt.kind === "HELDOUT" && graded.passed) {
      const moved = await prisma.ragProject.updateMany({ where: { id: attempt.projectId, level: attempt.level }, data: { level: attempt.level + 1 } });
      levelUp = moved.count === 1;
    }
    return { attempt, graded, levelUp };
  } catch (err) {
    await prisma.ragAttempt.updateMany({ where: { id: attemptId, status: "GRADING", gradedAt: claimedAt }, data: { status: "RUNNING" } });
    throw err;
  }
}
