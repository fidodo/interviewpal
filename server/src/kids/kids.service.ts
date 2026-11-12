import { prisma } from "../db/prisma";
import { parseJsonArray } from "../utils/json";
import { ChildContext, LevelContext } from "./kids.prompts";
import { ChallengeStatus, LevelEditor } from "./types";

// Children, courses and progress. The PIN is in kids.pin.service.ts and challenges in kids.challenges.service.ts.

const MAX_CHILDREN = 6;
// A question and its reply are written in one transaction and can share a timestamp; CHILD sorts before PAL.
export const MESSAGE_ORDER = [{ createdAt: "asc" as const }, { role: "asc" as const }];

export function toLevelContext(level: { order: number; title: string; editor: string; concepts: string; toolbox: string; challengesToPass: number }): LevelContext {
  return {
    order: level.order,
    title: level.title,
    editor: level.editor as LevelEditor,
    concepts: parseJsonArray(level.concepts),
    toolbox: parseJsonArray(level.toolbox),
    challengesToPass: level.challengesToPass,
  };
}

export function toChildContext(child: { displayName: string; age: number }): ChildContext {
  return { name: child.displayName, age: child.age };
}


// ---- Children ----

export function listChildren(parentId: string) {
  return prisma.childProfile.findMany({ where: { parentId }, orderBy: { createdAt: "asc" } });
}

export async function createChild(parentId: string, data: { displayName: string; age: number; avatar: string }) {
  const count = await prisma.childProfile.count({ where: { parentId } });
  if (count >= MAX_CHILDREN) return { error: "limit" as const };
  return { child: await prisma.childProfile.create({ data: { parentId, ...data } }) };
}

export function findChild(parentId: string, childId: string) {
  return prisma.childProfile.findFirst({ where: { id: childId, parentId } });
}

export async function updateChild(parentId: string, childId: string, data: Partial<{ displayName: string; age: number; avatar: string }>) {
  const child = await findChild(parentId, childId);
  if (!child) return null;
  return prisma.childProfile.update({ where: { id: childId }, data });
}

export async function deleteChild(parentId: string, childId: string) {
  const child = await findChild(parentId, childId);
  if (!child) return false;
  await prisma.childProfile.delete({ where: { id: childId } });
  return true;
}

// ---- Courses & progress ----

export function listCourses() {
  return prisma.course.findMany({
    where: { published: true },
    orderBy: { title: "asc" },
    include: { _count: { select: { levels: true } } },
  });
}

async function loadCourse(parentId: string, childId: string, slug: string) {
  const child = await findChild(parentId, childId);
  if (!child) return null;
  const course = await prisma.course.findUnique({ where: { slug }, include: { levels: { orderBy: { order: "asc" } } } });
  if (!course || !course.published) return null;
  return { child, course };
}

// Creates the enrollment on first real use (playing or a parent setting the level), not on page views.
export async function loadEnrollment(parentId: string, childId: string, slug: string) {
  const loaded = await loadCourse(parentId, childId, slug);
  if (!loaded) return null;
  const enrollment = await prisma.enrollment.upsert({
    where: { childId_courseId: { childId, courseId: loaded.course.id } },
    update: {},
    create: { childId, courseId: loaded.course.id },
  });
  return { ...loaded, enrollment };
}

export async function getCourseProgress(parentId: string, childId: string, slug: string) {
  const loaded = await loadCourse(parentId, childId, slug);
  if (!loaded) return null;
  const { child, course } = loaded;
  const existing = await prisma.enrollment.findUnique({ where: { childId_courseId: { childId, courseId: course.id } } });
  const enrollment = existing ?? { currentLevel: 1, passedAtLevel: 0 };

  const challenges = existing
    ? await prisma.challenge.findMany({
        where: { enrollmentId: existing.id },
        orderBy: { createdAt: "asc" },
        include: { attempts: { select: { stars: true, passed: true } } },
      })
    : [];

  const levels = course.levels.map((level) => {
    const atLevel = challenges.filter((c) => c.levelOrder === level.order);
    const passed = atLevel.filter((c) => c.status === ChallengeStatus.PASSED);
    const stars = passed.reduce((sum, c) => sum + Math.max(0, ...c.attempts.filter((a) => a.passed).map((a) => a.stars)), 0);
    return {
      order: level.order,
      title: level.title,
      editor: level.editor,
      challengesToPass: level.challengesToPass,
      passedCount: passed.length,
      stars,
    };
  });

  const open = challenges.filter((c) => c.status === ChallengeStatus.OPEN && c.levelOrder === enrollment.currentLevel).pop();

  return {
    child,
    course: { slug: course.slug, title: course.title, subject: course.subject, description: course.description },
    enrollment: { currentLevel: enrollment.currentLevel, passedAtLevel: enrollment.passedAtLevel },
    levels,
    openChallengeId: open?.id ?? null,
  };
}

export async function setLevel(parentId: string, childId: string, slug: string, currentLevel: number) {
  const loaded = await loadEnrollment(parentId, childId, slug);
  if (!loaded) return null;
  const max = loaded.course.levels.length;
  return prisma.enrollment.update({
    where: { id: loaded.enrollment.id },
    data: { currentLevel: Math.min(Math.max(currentLevel, 1), max), passedAtLevel: 0 },
  });
}

// ---- Parent activity view ----

export async function getActivity(parentId: string, childId: string) {
  const child = await findChild(parentId, childId);
  if (!child) return null;
  return prisma.challenge.findMany({
    where: { enrollment: { childId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      enrollment: { select: { course: { select: { title: true } } } },
      attempts: { orderBy: { createdAt: "asc" }, select: { passed: true, stars: true, createdAt: true } },
      messages: { orderBy: MESSAGE_ORDER },
    },
  });
}
