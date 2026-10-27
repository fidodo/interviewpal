import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import * as kidsService from "./kids.service";
import { parseJsonArray } from "./kids.service";
import { AVATARS } from "./types";


function notFound(res: Response, what = "Not found") {
  res.status(404).json({ error: what });
}

function serializeChild(child: { id: string; displayName: string; age: number; avatar: string }) {
  return { id: child.id, displayName: child.displayName, age: child.age, avatar: child.avatar };
}

function serializeAttempt(a: { id: string; code: string; output: string; passed: boolean; stars: number; praise: string; nextStep: string; createdAt: Date }) {
  return { id: a.id, code: a.code, output: a.output, passed: a.passed, stars: a.stars, praise: a.praise, nextStep: a.nextStep, createdAt: a.createdAt };
}

function serializeMessage(m: { id: string; role: string; text: string; createdAt: Date }) {
  return { id: m.id, role: m.role, text: m.text, createdAt: m.createdAt };
}

function serializeChallenge(c: {
  id: string;
  levelOrder: number;
  title: string;
  story: string;
  instructions: string;
  kind: string;
  starterCode: string;
  expectedOutput: string | null;
  status: string;
}) {
  return {
    id: c.id,
    levelOrder: c.levelOrder,
    title: c.title,
    story: c.story,
    instructions: c.instructions,
    kind: c.kind,
    starterCode: c.starterCode,
    hasExpectedOutput: c.expectedOutput != null,
    status: c.status,
  };
}

// ---- Children ----

const childSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
  age: z.number().int().min(5).max(17),
  avatar: z.enum(AVATARS),
});

export async function listChildren(req: AuthedRequest, res: Response) {
  const [children, pin] = await Promise.all([kidsService.listChildren(req.userId!), kidsService.getPinInfo(req.userId!)]);
  res.json({ children: children.map(serializeChild), hasPin: pin.hasPin, pinResetMethod: pin.resetMethod });
}

export async function createChild(req: AuthedRequest, res: Response) {
  const parsed = childSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name (up to 30 characters), an age from 5 to 17, and pick an avatar" });
    return;
  }
  const result = await kidsService.createChild(req.userId!, parsed.data);
  if ("error" in result) {
    res.status(409).json({ error: "You can add up to 6 learners" });
    return;
  }
  res.status(201).json({ child: serializeChild(result.child) });
}

export async function updateChild(req: AuthedRequest, res: Response) {
  const parsed = childSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid learner details" });
    return;
  }
  const child = await kidsService.updateChild(req.userId!, req.params.id, parsed.data);
  if (!child) return notFound(res, "Learner not found");
  res.json({ child: serializeChild(child) });
}

export async function deleteChild(req: AuthedRequest, res: Response) {
  const deleted = await kidsService.deleteChild(req.userId!, req.params.id);
  if (!deleted) return notFound(res, "Learner not found");
  res.status(204).send();
}

export async function getActivity(req: AuthedRequest, res: Response) {
  const challenges = await kidsService.getActivity(req.userId!, req.params.id);
  if (!challenges) return notFound(res, "Learner not found");
  res.json({
    challenges: challenges.map((c) => ({
      ...serializeChallenge(c),
      courseTitle: c.enrollment.course.title,
      createdAt: c.createdAt,
      attempts: c.attempts,
      messages: c.messages.map(serializeMessage),
    })),
  });
}

// ---- PIN ----

const pinSchema = z.string().regex(/^\d{4}$/);

export async function setPin(req: AuthedRequest, res: Response) {
  const parsed = z.object({ pin: pinSchema, currentPin: pinSchema.optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The PIN must be exactly 4 digits" });
    return;
  }
  const ok = await kidsService.setPin(req.userId!, parsed.data.pin, parsed.data.currentPin);
  if (!ok) {
    res.status(403).json({ error: "Current PIN is wrong. Forgot it? Use \"Forgot PIN?\" to reset it." });
    return;
  }
  res.status(204).send();
}

// Forgotten PIN: the parent proves who they are with their account password, or a fresh Google sign-in.
export async function resetPin(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ pin: pinSchema, password: z.string().min(1).max(200).optional(), credential: z.string().min(1).max(5000).optional() })
    .safeParse(req.body);
  if (!parsed.success || (!parsed.data.password && !parsed.data.credential)) {
    res.status(400).json({ error: "Enter your account password and a new 4-digit PIN" });
    return;
  }
  const ok = await kidsService.resetPin(req.userId!, parsed.data.pin, parsed.data);
  if (!ok) {
    res.status(403).json({ error: "That didn't match this account. Try again." });
    return;
  }
  res.status(204).send();
}

export async function verifyPin(req: AuthedRequest, res: Response) {
  const parsed = z.object({ pin: pinSchema }).safeParse(req.body);
  if (!parsed.success || !(await kidsService.verifyPin(req.userId!, parsed.data.pin))) {
    res.status(403).json({ error: "That PIN isn't right" });
    return;
  }
  res.status(204).send();
}

// ---- Courses ----

export async function listCourses(_req: AuthedRequest, res: Response) {
  const courses = await kidsService.listCourses();
  res.json({
    courses: courses.map((c) => ({ slug: c.slug, title: c.title, subject: c.subject, description: c.description, levelCount: c._count.levels })),
  });
}

export async function getCourseProgress(req: AuthedRequest, res: Response) {
  const progress = await kidsService.getCourseProgress(req.userId!, req.params.childId, req.params.slug);
  if (!progress) return notFound(res, "Course not found");
  res.json({ ...progress, child: serializeChild(progress.child) });
}

export async function setLevel(req: AuthedRequest, res: Response) {
  const parsed = z.object({ currentLevel: z.number().int().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid level" });
    return;
  }
  const enrollment = await kidsService.setLevel(req.userId!, req.params.childId, req.params.slug, parsed.data.currentLevel);
  if (!enrollment) return notFound(res, "Course not found");
  res.json({ enrollment: { currentLevel: enrollment.currentLevel, passedAtLevel: enrollment.passedAtLevel } });
}

// ---- Challenges ----

export async function nextChallenge(req: AuthedRequest, res: Response) {
  const parsed = z.object({ fresh: z.boolean().optional() }).safeParse(req.body ?? {});
  const challenge = await kidsService.nextChallenge(req.userId!, req.params.childId, req.params.slug, parsed.success && !!parsed.data.fresh);
  if (!challenge) return notFound(res, "Course not found");
  res.status(201).json({ challenge: serializeChallenge(challenge) });
}

export async function getChallenge(req: AuthedRequest, res: Response) {
  const result = await kidsService.getChallenge(req.userId!, req.params.id);
  if (!result) return notFound(res, "Challenge not found");
  const { challenge, level, child, course, enrollment, attempts, messages } = result;
  res.json({
    challenge: serializeChallenge(challenge),
    level: {
      order: level.order,
      title: level.title,
      editor: level.editor,
      toolbox: parseJsonArray(level.toolbox),
      challengesToPass: level.challengesToPass,
    },
    child: serializeChild(child),
    course: { slug: course.slug, title: course.title },
    enrollment: { currentLevel: enrollment.currentLevel, passedAtLevel: enrollment.passedAtLevel },
    attempts: attempts.map(serializeAttempt),
    messages: messages.map(serializeMessage),
  });
}

const attemptSchema = z.object({
  code: z.string().min(1).max(20000),
  output: z.string().max(20000),
  error: z.string().max(5000).nullable(),
  turtle: z.string().max(4000).default(""),
});

export async function submitAttempt(req: AuthedRequest, res: Response) {
  const parsed = attemptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add some code before asking Pal to check it" });
    return;
  }
  const result = await kidsService.submitAttempt(req.userId!, req.params.id, parsed.data);
  if (!result) return notFound(res, "Challenge not found");
  res.status(201).json({ attempt: serializeAttempt(result.attempt), leveledUp: result.leveledUp, courseComplete: result.courseComplete });
}

const helpSchema = z.object({
  message: z.string().trim().min(1).max(500),
  code: z.string().max(20000).default(""),
});

export async function askHelp(req: AuthedRequest, res: Response) {
  const parsed = helpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Type a question for Pal (up to 500 characters)" });
    return;
  }
  const messages = await kidsService.askHelp(req.userId!, req.params.id, parsed.data.message, parsed.data.code);
  if (!messages) return notFound(res, "Challenge not found");
  res.status(201).json({ messages: messages.map(serializeMessage) });
}
