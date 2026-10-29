import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import * as learnService from "./learn.service";

function notFound(res: Response, what = "Course not found") {
  res.status(404).json({ error: what });
}

export async function listCourses(req: AuthedRequest, res: Response) {
  const { courses, dueCount } = await learnService.listCourses(req.userId!);
  res.json({
    dueCount,
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      level: c.level,
      skillId: c.skillId,
      lessonCount: c.lessons.length,
      completedCount: c.lessons.filter((l) => l.completedAt).length,
    })),
  });
}

const createSchema = z.union([
  z.object({ skillId: z.string().min(1).max(40) }),
  z.object({ topic: z.string().trim().min(2).max(120), level: z.nativeEnum(Difficulty) }),
]);

export async function createCourse(req: AuthedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Type a topic (2-120 characters) and pick a level" });
    return;
  }
  const course = await learnService.createCourse(req.userId!, parsed.data);
  if (!course) return notFound(res, "Skill not found");
  res.status(201).json({ course: { id: course.id } });
}

// Looks up a skill's existing course without touching the AI allowance (POST /courses is rate limited).
export async function findSkillCourse(req: AuthedRequest, res: Response) {
  const course = await learnService.findSkillCourse(req.userId!, req.params.skillId);
  res.json({ course: course ? { id: course.id } : null });
}

export async function getCourse(req: AuthedRequest, res: Response) {
  const course = await learnService.getCourse(req.userId!, req.params.id);
  if (!course) return notFound(res);
  res.json({
    course: {
      id: course.id,
      title: course.title,
      summary: course.summary,
      level: course.level,
      skill: course.skill ? { name: course.skill.name, roleTitle: course.skill.role.title } : null,
      lessons: course.lessons.map((l) => ({
        id: l.id,
        order: l.order,
        title: l.title,
        objective: l.objective,
        written: l.content != null,
        completed: l.completedAt != null,
        questionCount: l._count.questions,
      })),
    },
  });
}

export async function deleteCourse(req: AuthedRequest, res: Response) {
  if (!(await learnService.deleteCourse(req.userId!, req.params.id))) return notFound(res);
  res.status(204).send();
}

export async function getLesson(req: AuthedRequest, res: Response) {
  const result = await learnService.getLesson(req.userId!, req.params.id);
  if (!result) return notFound(res, "Lesson not found");
  const { lesson, questions } = result;
  const siblings = lesson.course.lessons;
  const index = siblings.findIndex((l) => l.id === lesson.id);
  res.json({
    lesson: {
      id: lesson.id,
      order: lesson.order,
      title: lesson.title,
      objective: lesson.objective,
      content: lesson.content,
      completed: lesson.completedAt != null,
      course: { id: lesson.course.id, title: lesson.course.title, lessonCount: siblings.length },
      nextLessonId: siblings[index + 1]?.id ?? null,
      questions: questions.map((q) => {
        const last = q.responses[0];
        return {
          id: q.id,
          order: q.order,
          kind: q.kind,
          prompt: q.prompt,
          options: learnService.parseOptions(q.options),
          // The correct answer is only revealed once the learner has answered.
          result: last
            ? {
                response: last.response,
                correct: last.correct,
                feedback: last.feedback,
                correctIndex: q.kind === "MCQ" ? Number(q.answer) : null,
                modelAnswer: q.kind === "SHORT" ? q.answer : null,
                explanation: q.explanation,
              }
            : null,
        };
      }),
    },
  });
}

export async function generateLesson(req: AuthedRequest, res: Response) {
  if (!(await learnService.generateLesson(req.userId!, req.params.id))) return notFound(res, "Lesson not found");
  res.status(204).send();
}

async function answer(req: AuthedRequest, res: Response, body: { choice?: number; text?: string }, fromReview: boolean) {
  const result = await learnService.answerQuestion(req.userId!, req.params.id, body, fromReview);
  if (!result) return notFound(res, "Question not found");
  if (result === "wrongKind") {
    res.status(400).json({ error: "That isn't the right kind of answer for this question" });
    return;
  }
  res.status(201).json({ result });
}

export async function answerChoice(req: AuthedRequest, res: Response) {
  const parsed = z.object({ choice: z.number().int().min(0).max(3), fromReview: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick one of the options" });
    return;
  }
  await answer(req, res, { choice: parsed.data.choice }, !!parsed.data.fromReview);
}

export async function answerWritten(req: AuthedRequest, res: Response) {
  const parsed = z.object({ text: z.string().trim().min(1).max(3000), fromReview: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Write an answer (up to 3,000 characters)" });
    return;
  }
  await answer(req, res, { text: parsed.data.text }, !!parsed.data.fromReview);
}

export async function dueReviews(req: AuthedRequest, res: Response) {
  const items = await learnService.dueReviews(req.userId!);
  res.json({
    items: items.map((i) => ({
      id: i.id,
      box: i.box,
      question: {
        id: i.question.id,
        kind: i.question.kind,
        prompt: i.question.prompt,
        options: learnService.parseOptions(i.question.options),
      },
      lessonTitle: i.question.lesson.title,
      course: i.question.lesson.course,
    })),
  });
}
