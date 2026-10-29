import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { Difficulty } from "../types";
import * as rolesService from "./roles.service";

function notFound(res: Response) {
  res.status(404).json({ error: "Role not found" });
}

const optionalText = z
  .string()
  .max(8000)
  .nullish()
  .transform((t) => (t?.trim() ? t.trim() : null));

const roleSchema = z.object({
  title: z.string().trim().min(2).max(60),
  level: z.nativeEnum(Difficulty),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), "Invalid date")
    .nullish()
    .transform((d) => (d ? new Date(`${d}T00:00:00Z`) : null)),
  jobDescription: optionalText,
  cvSummary: optionalText,
});

type RoleDetail = NonNullable<Awaited<ReturnType<typeof rolesService.getRoleDetail>>>;

function serializeDetail({ role, skills, readiness, readinessChange }: RoleDetail) {
  return {
    role: {
      id: role.id,
      title: role.title,
      level: role.level,
      targetDate: role.targetDate,
      jobDescription: role.jobDescription,
      cvSummary: role.cvSummary,
      isTechnical: role.isTechnical,
      isActive: role.isActive,
      sessionCount: role._count.sessions,
    },
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      importance: s.importance,
      selfRating: s.selfRating,
      rating: s.rating,
      ratingWeekAgo: s.ratingWeekAgo,
      evidenceCount: s.evidenceCount,
      history: s.history.map((h) => ({ rating: h.rating, source: h.source, at: h.createdAt })),
    })),
    goals: role.goals.map((g) => ({ id: g.id, text: g.text, done: g.done, skillId: g.skillId })),
    readiness,
    readinessChange,
  };
}

export async function listRoles(req: AuthedRequest, res: Response) {
  const roles = await rolesService.listRoles(req.userId!);
  res.json({
    roles: roles.map((r) => ({
      id: r.id,
      title: r.title,
      level: r.level,
      targetDate: r.targetDate,
      isActive: r.isActive,
      skillCount: r.skills.length,
      readiness: rolesService.readiness(r.skills),
    })),
  });
}

export async function createRole(req: AuthedRequest, res: Response) {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Give the role a title (2-60 characters) and a level. Pasted text can be up to 8,000 characters." });
    return;
  }
  const role = await rolesService.createRole(req.userId!, parsed.data);
  res.status(201).json({ role: { id: role.id } });
}

export async function getRole(req: AuthedRequest, res: Response) {
  const detail = await rolesService.getRoleDetail(req.userId!, req.params.id);
  if (!detail) return notFound(res);
  res.json(serializeDetail(detail));
}

// The home page hub: the active role's full detail, or null when the user hasn't set one up.
export async function getActiveRole(req: AuthedRequest, res: Response) {
  const id = await rolesService.getActiveRoleId(req.userId!);
  const detail = id ? await rolesService.getRoleDetail(req.userId!, id) : null;
  res.json({ active: detail ? serializeDetail(detail) : null });
}

export async function updateRole(req: AuthedRequest, res: Response) {
  const parsed = roleSchema.partial().extend({ isTechnical: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid role details" });
    return;
  }
  const role = await rolesService.updateRole(req.userId!, req.params.id, parsed.data);
  if (!role) return notFound(res);
  res.json({ role: { id: role.id } });
}

export async function deleteRole(req: AuthedRequest, res: Response) {
  if (!(await rolesService.deleteRole(req.userId!, req.params.id))) return notFound(res);
  res.status(204).send();
}

export async function activateRole(req: AuthedRequest, res: Response) {
  if (!(await rolesService.activateRole(req.userId!, req.params.id))) return notFound(res);
  res.status(204).send();
}

export async function rateSkills(req: AuthedRequest, res: Response) {
  const parsed = z
    .object({ ratings: z.array(z.object({ skillId: z.string().min(1).max(40), rating: z.number().int().min(1).max(5) })).max(30) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ratings must be whole numbers from 1 to 5" });
    return;
  }
  if (!(await rolesService.rateSkills(req.userId!, req.params.id, parsed.data.ratings))) return notFound(res);
  res.status(204).send();
}

export async function addSkill(req: AuthedRequest, res: Response) {
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Skill names are 1-60 characters" });
    return;
  }
  const skill = await rolesService.addSkill(req.userId!, req.params.id, parsed.data.name);
  if (!skill) return notFound(res);
  res.status(201).json({ skill: { id: skill.id } });
}

export async function removeSkill(req: AuthedRequest, res: Response) {
  if (!(await rolesService.removeSkill(req.userId!, req.params.id, req.params.skillId))) return notFound(res);
  res.status(204).send();
}

export async function regenerateSkills(req: AuthedRequest, res: Response) {
  if (!(await rolesService.regenerateSkills(req.userId!, req.params.id))) return notFound(res);
  res.status(204).send();
}

function noSkills(res: Response) {
  res.status(409).json({ error: "This role has no skills yet. Add at least one skill first." });
}

export async function generateGoals(req: AuthedRequest, res: Response) {
  const result = await rolesService.generateGoals(req.userId!, req.params.id);
  if (!result) return notFound(res);
  if (result === "noSkills") return noSkills(res);
  res.status(204).send();
}

export async function setGoalDone(req: AuthedRequest, res: Response) {
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid goal update" });
    return;
  }
  if (!(await rolesService.setGoalDone(req.userId!, req.params.goalId, parsed.data.done))) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.status(204).send();
}

export async function startPractice(req: AuthedRequest, res: Response) {
  const parsed = z.object({ skillId: z.string().max(40).optional() }).safeParse(req.body ?? {});
  const session = await rolesService.startPractice(req.userId!, req.params.id, parsed.success ? parsed.data.skillId : undefined);
  if (!session) return notFound(res);
  if (session === "noSkills") return noSkills(res);
  res.status(201).json({ session: { id: session.id } });
}
