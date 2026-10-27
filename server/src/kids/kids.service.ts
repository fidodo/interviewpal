import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import { aiProvider } from "../ai/provider.factory";
import { verifyGoogleEmail } from "../services/auth.service";
import { challengePrompt, helpPrompt, reviewPrompt, ChildContext, LevelContext } from "./kids.prompts";
import { generatedChallengeSchema, helpReplySchema, reviewResultSchema } from "./kids.schemas";
import { ChallengeKind, ChallengeStatus, HelpRole, LevelEditor } from "./types";

const MAX_CHILDREN = 6;
// A question and its reply are written in one transaction and can share a timestamp; CHILD sorts before PAL.
const MESSAGE_ORDER = [{ createdAt: "asc" as const }, { role: "asc" as const }];

export function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function toLevelContext(level: { order: number; title: string; editor: string; concepts: string; toolbox: string; challengesToPass: number }): LevelContext {
  return {
    order: level.order,
    title: level.title,
    editor: level.editor as LevelEditor,
    concepts: parseJsonArray(level.concepts),
    toolbox: parseJsonArray(level.toolbox),
    challengesToPass: level.challengesToPass,
  };
}

function toChildContext(child: { displayName: string; age: number }): ChildContext {
  return { name: child.displayName, age: child.age };
}

// Ignore trailing spaces and blank lines at the end, which kids (and print()) add without meaning to.
function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
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

// ---- Parent PIN ----

// How a forgotten PIN can be reset: with the account password, or by signing in with Google again
// for Google-only accounts (which have no password).
export async function getPinInfo(parentId: string) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true, passwordHash: true } });
  return { hasPin: !!user?.kidsPinHash, resetMethod: user?.passwordHash ? ("password" as const) : ("google" as const) };
}

// Changing an existing PIN needs the current one; a forgotten PIN goes through resetPin instead.
export async function setPin(parentId: string, pin: string, currentPin: string | undefined) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true } });
  if (!user) return false;
  if (user.kidsPinHash && (!currentPin || !(await bcrypt.compare(currentPin, user.kidsPinHash)))) return false;
  await prisma.user.update({ where: { id: parentId }, data: { kidsPinHash: await bcrypt.hash(pin, 10) } });
  return true;
}

export async function resetPin(parentId: string, pin: string, proof: { password?: string; credential?: string }) {
  const user = await prisma.user.findUnique({ where: { id: parentId } });
  if (!user) return false;
  let proven = false;
  if (proof.password && user.passwordHash) {
    proven = await bcrypt.compare(proof.password, user.passwordHash);
  } else if (proof.credential) {
    proven = (await verifyGoogleEmail(proof.credential)) === user.email;
  }
  if (!proven) return false;
  await prisma.user.update({ where: { id: parentId }, data: { kidsPinHash: await bcrypt.hash(pin, 10) } });
  return true;
}

export async function verifyPin(parentId: string, pin: string) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true } });
  if (!user?.kidsPinHash) return true;
  return bcrypt.compare(pin, user.kidsPinHash);
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
async function loadEnrollment(parentId: string, childId: string, slug: string) {
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

// ---- Challenges ----

export async function nextChallenge(parentId: string, childId: string, slug: string, fresh: boolean) {
  const loaded = await loadEnrollment(parentId, childId, slug);
  if (!loaded) return null;
  const { child, course, enrollment } = loaded;
  const level = course.levels.find((l) => l.order === enrollment.currentLevel);
  if (!level) return null;

  if (!fresh) {
    const open = await prisma.challenge.findFirst({
      where: { enrollmentId: enrollment.id, levelOrder: level.order, status: ChallengeStatus.OPEN },
      orderBy: { createdAt: "desc" },
    });
    if (open) return open;
  }

  const history = await prisma.challenge.findMany({
    where: { enrollmentId: enrollment.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, status: true },
  });

  const levelContext = toLevelContext(level);
  const raw = await aiProvider.generateJson(
    challengePrompt({
      child: toChildContext(child),
      level: levelContext,
      passedAtLevel: enrollment.passedAtLevel,
      history: history.reverse().map((c) => ({ title: c.title, passed: c.status === ChallengeStatus.PASSED })),
    })
  );
  const generated = generatedChallengeSchema.parse(raw);

  return prisma.challenge.create({
    data: {
      enrollmentId: enrollment.id,
      levelOrder: level.order,
      title: generated.title,
      story: generated.story,
      instructions: generated.instructions,
      kind: generated.kind,
      starterCode: levelContext.editor === LevelEditor.BLOCKS ? "" : generated.starterCode,
      expectedOutput: generated.kind === ChallengeKind.TEXT ? (generated.expectedOutput ?? null) : null,
      sampleInput: levelContext.editor === LevelEditor.PYTHON ? generated.sampleInput?.trim() || null : null,
    },
  });
}

async function loadChallenge(parentId: string, challengeId: string) {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, enrollment: { child: { parentId } } },
    include: { enrollment: { include: { child: true, course: { include: { levels: { orderBy: { order: "asc" } } } } } } },
  });
  if (!challenge) return null;
  const level = challenge.enrollment.course.levels.find((l) => l.order === challenge.levelOrder);
  if (!level) return null;
  return { challenge, level, child: challenge.enrollment.child, course: challenge.enrollment.course, enrollment: challenge.enrollment };
}

export async function getChallenge(parentId: string, challengeId: string) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const [attempts, messages] = await Promise.all([
    prisma.attempt.findMany({ where: { challengeId }, orderBy: { createdAt: "asc" } }),
    prisma.helpMessage.findMany({ where: { challengeId }, orderBy: MESSAGE_ORDER }),
  ]);
  return { ...loaded, attempts, messages };
}

export async function submitAttempt(
  parentId: string,
  challengeId: string,
  submission: { code: string; input: string; output: string; error: string | null; turtle: string }
) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const { challenge, level, child, course, enrollment } = loaded;

  // The expected output only applies when the learner used the same input() answers it was worked out with.
  const sameAnswers = normalizeOutput(submission.input) === normalizeOutput(challenge.sampleInput ?? "");
  const outputMatches =
    submission.error == null && challenge.expectedOutput != null && sameAnswers
      ? normalizeOutput(submission.output) === normalizeOutput(challenge.expectedOutput)
      : null;

  const raw = await aiProvider.generateJson(
    reviewPrompt({
      child: toChildContext(child),
      level: toLevelContext(level),
      challenge: {
        title: challenge.title,
        instructions: challenge.instructions,
        kind: challenge.kind as ChallengeKind,
        expectedOutput: challenge.expectedOutput,
        sampleInput: challenge.sampleInput,
      },
      code: submission.code,
      input: submission.input,
      output: submission.output,
      error: submission.error,
      turtle: submission.turtle,
      outputMatches,
    })
  );
  const review = reviewResultSchema.parse(raw);
  // The deterministic checks win over the model's opinion.
  const passed = submission.error != null ? false : outputMatches === true ? true : review.passed;
  const stars = passed ? Math.max(review.stars, 2) : 1;

  const attempt = await prisma.attempt.create({
    data: {
      challengeId,
      code: submission.code,
      output: submission.output,
      passed,
      stars,
      praise: review.praise,
      nextStep: review.nextStep,
    },
  });

  // Progress updates are conditional writes, so two overlapping checks of the same challenge (two tabs, a retry)
  // can only count it once and can only level up once.
  let leveledUp = false;
  let courseComplete = false;
  if (passed) {
    const claimed = await prisma.challenge.updateMany({
      where: { id: challengeId, status: ChallengeStatus.OPEN },
      data: { status: ChallengeStatus.PASSED },
    });
    const counted =
      claimed.count === 1 &&
      (
        await prisma.enrollment.updateMany({
          where: { id: enrollment.id, currentLevel: level.order, passedAtLevel: { lt: level.challengesToPass } },
          data: { passedAtLevel: { increment: 1 } },
        })
      ).count === 1;
    if (counted) {
      const updated = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
      if (updated && updated.passedAtLevel >= level.challengesToPass) {
        if (level.order >= course.levels.length) {
          courseComplete = true;
        } else {
          const moved = await prisma.enrollment.updateMany({
            where: { id: enrollment.id, currentLevel: level.order },
            data: { currentLevel: level.order + 1, passedAtLevel: 0 },
          });
          leveledUp = moved.count === 1;
        }
      }
    }
  }

  return { attempt, leveledUp, courseComplete };
}

export async function askHelp(parentId: string, challengeId: string, message: string, code: string) {
  const loaded = await loadChallenge(parentId, challengeId);
  if (!loaded) return null;
  const { challenge, level, child } = loaded;

  const chat = await prisma.helpMessage.findMany({ where: { challengeId }, orderBy: MESSAGE_ORDER });
  const raw = await aiProvider.generateJson(
    helpPrompt({
      child: toChildContext(child),
      level: toLevelContext(level),
      challenge: { title: challenge.title, instructions: challenge.instructions },
      code,
      chat: chat.map((m) => ({ role: m.role as "CHILD" | "PAL", text: m.text })),
      message,
    })
  );
  const { reply } = helpReplySchema.parse(raw);

  const [childMessage, palMessage] = await prisma.$transaction([
    prisma.helpMessage.create({ data: { challengeId, role: HelpRole.CHILD, text: message } }),
    prisma.helpMessage.create({ data: { challengeId, role: HelpRole.PAL, text: reply } }),
  ]);
  return [childMessage, palMessage];
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
