import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { parseJsonArray } from "../utils/json";
import { generateValidated } from "../ai/retry";
import { levelLabel } from "../roles/roles.prompts";
import { lessonPrompt, outlinePrompt, shortAnswerPrompt } from "./learn.prompts";
import { lessonSchema, outlineSchema, shortMarkSchema } from "./learn.schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
// Spaced repetition: days until the next review for boxes 1-4. Answering correctly in box 4 retires the item.
const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];
const MAX_BOX = 4;
const REVIEW_BATCH = 20;

const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

export const parseOptions = (value: string) => parseJsonArray<string>(value);

// Models tend to put the right answer in the same position, so shuffle the options and track where it lands.
function shuffleOptions(options: string[], correctIndex: number) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), correctIndex: order.indexOf(correctIndex) };
}

// ---- Courses ----

export async function listCourses(userId: string) {
  const [courses, dueCount] = await Promise.all([
    prisma.learnCourse.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { lessons: { select: { completedAt: true } } },
    }),
    countDue(userId),
  ]);
  return { courses, dueCount };
}

function countDue(userId: string) {
  return prisma.reviewItem.count({ where: { userId, dueAt: { lte: new Date() } } });
}

// The existing course for a skill, if there is one (no AI involved, so callers can check before paying for one).
export function findSkillCourse(userId: string, skillId: string) {
  return prisma.learnCourse.findFirst({ where: { userId, skillId } });
}

// A course for one skill of a target role (one per skill: asking again returns it), or for any topic.
export async function createCourse(userId: string, input: { skillId?: string; topic?: string; level?: string }) {
  let topic: string;
  let level: string;
  let context = "";
  let skillId: string | null = null;

  if (input.skillId) {
    const skill = await prisma.roleSkill.findFirst({ where: { id: input.skillId, role: { userId } }, include: { role: true } });
    if (!skill) return null;
    const existing = await prisma.learnCourse.findFirst({ where: { userId, skillId: skill.id } });
    if (existing) return existing;
    topic = skill.name;
    level = skill.role.level;
    skillId = skill.id;
    context = `They are preparing to get hired as a ${levelLabel(level)} "${skill.role.title}". ${skill.description}`.slice(0, 600);
  } else if (input.topic && input.level) {
    topic = input.topic;
    level = input.level;
  } else {
    return null;
  }

  const outline = await generateValidated(outlinePrompt({ topic, level, context }), outlineSchema);
  try {
    return await prisma.learnCourse.create({
      data: {
        userId,
        skillId,
        title: outline.title,
        summary: outline.summary,
        level,
        context,
        lessons: { create: outline.lessons.map((l, i) => ({ order: i + 1, title: l.title, objective: l.objective })) },
      },
    });
  } catch (err) {
    // Two requests for the same skill at once: one course per skill (unique index), so return the winner's.
    if (skillId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.learnCourse.findFirstOrThrow({ where: { userId, skillId } });
    }
    throw err;
  }
}

export function getCourse(userId: string, courseId: string) {
  return prisma.learnCourse.findFirst({
    where: { id: courseId, userId },
    include: {
      skill: { select: { name: true, role: { select: { title: true } } } },
      lessons: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, title: true, objective: true, completedAt: true, content: true, _count: { select: { questions: true } } },
      },
    },
  });
}

export async function deleteCourse(userId: string, courseId: string) {
  const deleted = await prisma.learnCourse.deleteMany({ where: { id: courseId, userId } });
  return deleted.count === 1;
}

// ---- Lessons ----

function findLesson(userId: string, lessonId: string) {
  return prisma.learnLesson.findFirst({
    where: { id: lessonId, course: { userId } },
    include: { course: { include: { lessons: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } } } } },
  });
}

// The lesson with its questions. Correct answers are only included for questions already answered.
export async function getLesson(userId: string, lessonId: string) {
  const lesson = await findLesson(userId, lessonId);
  if (!lesson) return null;
  const questions = await prisma.learnQuestion.findMany({
    where: { lessonId },
    orderBy: { order: "asc" },
    include: { responses: { where: { fromReview: false }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return { lesson, questions };
}

// Writes the lesson the first time it's opened. If two requests race, only the first write is kept.
export async function generateLesson(userId: string, lessonId: string) {
  const lesson = await findLesson(userId, lessonId);
  if (!lesson) return null;
  if (lesson.content) return true;

  const written = await generateValidated(
    lessonPrompt({
      courseTitle: lesson.course.title,
      level: lesson.course.level,
      context: lesson.course.context,
      lesson: { title: lesson.title, objective: lesson.objective },
      outline: lesson.course.lessons.map((l) => l.title),
    }),
    lessonSchema
  );

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.learnLesson.updateMany({ where: { id: lessonId, content: null }, data: { content: written.content } });
    if (claimed.count !== 1) return;
    await tx.learnCourse.update({ where: { id: lesson.courseId }, data: { updatedAt: new Date() } });
    await tx.learnQuestion.createMany({
      data: written.questions.map((q, i) => {
        if (q.kind !== "MCQ") {
          return { lessonId, order: i + 1, kind: q.kind, prompt: q.prompt, options: "[]", answer: q.modelAnswer, explanation: q.explanation };
        }
        const { options, correctIndex } = shuffleOptions(q.options, q.correctIndex);
        return { lessonId, order: i + 1, kind: q.kind, prompt: q.prompt, options: JSON.stringify(options), answer: String(correctIndex), explanation: q.explanation };
      }),
    });
  });
  return true;
}

// ---- Answering and spaced repetition ----

function findQuestion(userId: string, questionId: string) {
  return prisma.learnQuestion.findFirst({
    where: { id: questionId, lesson: { course: { userId } } },
    include: { lesson: { include: { course: { select: { level: true, id: true } } } } },
  });
}

// Conditional writes throughout, so two overlapping answers (double submit, two tabs) can't double-promote an
// item or fail on one that the other already retired.
async function schedule(userId: string, questionId: string, correct: boolean, fromReview: boolean) {
  const item = await prisma.reviewItem.findUnique({ where: { userId_questionId: { userId, questionId } } });
  if (!correct) {
    // Wrong answers (in a lesson or a review) come back tomorrow.
    await prisma.reviewItem.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: { box: 1, dueAt: daysFromNow(BOX_INTERVAL_DAYS[1]) },
      create: { userId, questionId, box: 1, dueAt: daysFromNow(BOX_INTERVAL_DAYS[1]) },
    });
    return { nextReviewDays: BOX_INTERVAL_DAYS[1], mastered: false };
  }
  if (!fromReview || !item) return { nextReviewDays: null, mastered: false };
  // Only a review of an item that is actually due moves it along; answering early changes nothing.
  if (item.dueAt > new Date()) {
    return { nextReviewDays: Math.ceil((item.dueAt.getTime() - Date.now()) / DAY_MS), mastered: false };
  }
  const due = { id: item.id, box: item.box, dueAt: { lte: new Date() } };
  if (item.box >= MAX_BOX) {
    await prisma.reviewItem.deleteMany({ where: due });
    return { nextReviewDays: null, mastered: true };
  }
  const box = item.box + 1;
  await prisma.reviewItem.updateMany({ where: due, data: { box, dueAt: daysFromNow(BOX_INTERVAL_DAYS[box]) } });
  return { nextReviewDays: BOX_INTERVAL_DAYS[box], mastered: false };
}

// A lesson is complete once every question has been answered at least once.
async function markLessonIfComplete(lessonId: string) {
  const unanswered = await prisma.learnQuestion.count({ where: { lessonId, responses: { none: {} } } });
  if (unanswered > 0) return false;
  await prisma.learnLesson.updateMany({ where: { id: lessonId, completedAt: null }, data: { completedAt: new Date() } });
  return true;
}

export type AnswerResult =
  | null
  | "wrongKind"
  | {
      correct: boolean;
      feedback: string;
      correctIndex: number | null;
      modelAnswer: string | null;
      explanation: string;
      nextReviewDays: number | null;
      mastered: boolean;
      lessonComplete: boolean;
    };

export async function answerQuestion(
  userId: string,
  questionId: string,
  response: { choice?: number; text?: string },
  fromReview: boolean
): Promise<AnswerResult> {
  const question = await findQuestion(userId, questionId);
  if (!question) return null;

  let correct: boolean;
  let feedback = "";
  let stored: string;
  if (question.kind === "MCQ") {
    if (response.choice == null) return "wrongKind";
    correct = response.choice === Number(question.answer);
    stored = String(response.choice);
  } else {
    if (!response.text) return "wrongKind";
    const mark = await generateValidated(
      shortAnswerPrompt({ question: question.prompt, modelAnswer: question.answer, response: response.text, level: question.lesson.course.level }),
      shortMarkSchema
    );
    correct = mark.correct;
    feedback = mark.feedback;
    stored = response.text;
  }

  await prisma.learnAnswer.create({ data: { questionId, response: stored, correct, feedback, fromReview } });
  const { nextReviewDays, mastered } = await schedule(userId, questionId, correct, fromReview);
  const lessonComplete = fromReview ? false : await markLessonIfComplete(question.lessonId);

  return {
    correct,
    feedback,
    correctIndex: question.kind === "MCQ" ? Number(question.answer) : null,
    modelAnswer: question.kind === "SHORT" ? question.answer : null,
    explanation: question.explanation,
    nextReviewDays,
    mastered,
    lessonComplete,
  };
}

export async function dueReviews(userId: string) {
  return prisma.reviewItem.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: REVIEW_BATCH,
    include: { question: { include: { lesson: { select: { title: true, course: { select: { id: true, title: true } } } } } } },
  });
}
