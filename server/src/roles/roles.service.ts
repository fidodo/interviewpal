import { prisma } from "../db/prisma";
import { generateValidated } from "../ai/retry";
import { RoleContext } from "../ai/provider.interface";
import { goalsPrompt, skillsPrompt } from "./roles.prompts";
import { generatedGoalsSchema, generatedSkillsSchema } from "./roles.schemas";

export interface RoleInput {
  title: string;
  level: string;
  targetDate: Date | null;
  jobDescription: string | null;
  cvSummary: string | null;
}

// How much one graded answer moves a skill rating: new = old * (1 - w) + evidence * w.
const EVIDENCE_WEIGHT = 0.3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_POINTS = 60;

// Weakest first: lowest rating (unrated counts as lowest), then most important.
const weakestFirst = <T extends { rating: number | null; importance: number }>(skills: T[]) =>
  [...skills].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0) || b.importance - a.importance);

const clampRating = (n: number) => Math.min(5, Math.max(1, n));

// Monday 00:00 UTC of the current week; weekly goals are grouped by it.
export function currentWeekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

// Importance-weighted average of the rated skills, as 0-100. Null until at least one skill has a rating.
export function readiness(skills: { importance: number; rating: number | null }[]) {
  const rated = skills.filter((s) => s.rating != null);
  if (rated.length === 0) return null;
  const weight = rated.reduce((sum, s) => sum + s.importance, 0);
  const score = rated.reduce((sum, s) => sum + s.importance * (s.rating! / 5), 0);
  return Math.round((score / weight) * 100);
}

async function generateSkills(input: RoleInput, existingSkills?: string[]) {
  const parsed = await generateValidated(skillsPrompt({ ...input, existingSkills }), generatedSkillsSchema);
  // The model occasionally repeats a skill; keep the first of each name.
  const seen = new Set<string>();
  const skills = parsed.skills.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { isTechnical: parsed.isTechnical, skills };
}

function findRole(userId: string, roleId: string) {
  return prisma.targetRole.findFirst({ where: { id: roleId, userId } });
}

export function listRoles(userId: string) {
  return prisma.targetRole.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: { skills: { select: { importance: true, rating: true } } },
  });
}

export async function createRole(userId: string, input: RoleInput) {
  const generated = await generateSkills(input);
  const hasActive = (await prisma.targetRole.count({ where: { userId, isActive: true } })) > 0;
  return prisma.targetRole.create({
    data: {
      userId,
      ...input,
      isTechnical: generated.isTechnical,
      isActive: !hasActive,
      skills: {
        create: generated.skills.map((s) => ({
          name: s.name,
          category: s.category,
          importance: s.importance,
          description: s.description,
          // A CV-based estimate is only a suggestion: it pre-fills the self-rating form, it isn't a rating yet.
          selfRating: s.suggestedRating,
        })),
      },
    },
  });
}

export async function updateRole(userId: string, roleId: string, input: Partial<RoleInput> & { isTechnical?: boolean }) {
  const role = await findRole(userId, roleId);
  if (!role) return null;
  return prisma.targetRole.update({ where: { id: roleId }, data: input });
}

export async function deleteRole(userId: string, roleId: string) {
  const role = await findRole(userId, roleId);
  if (!role) return false;
  await prisma.targetRole.delete({ where: { id: roleId } });
  if (role.isActive) {
    const next = await prisma.targetRole.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (next) await prisma.targetRole.update({ where: { id: next.id }, data: { isActive: true } });
  }
  return true;
}

export async function activateRole(userId: string, roleId: string) {
  const role = await findRole(userId, roleId);
  if (!role) return false;
  await prisma.$transaction([
    prisma.targetRole.updateMany({ where: { userId, isActive: true }, data: { isActive: false } }),
    prisma.targetRole.update({ where: { id: roleId }, data: { isActive: true } }),
  ]);
  return true;
}

export async function getRoleDetail(userId: string, roleId: string) {
  const role = await prisma.targetRole.findFirst({
    where: { id: roleId, userId },
    include: {
      // Recent history only: enough for a sparkline and the week-ago value without growing forever.
      skills: {
        orderBy: [{ importance: "desc" }, { name: "asc" }],
        include: { history: { orderBy: { createdAt: "desc" }, take: HISTORY_POINTS } },
      },
      goals: { where: { weekStart: currentWeekStart() }, orderBy: { createdAt: "asc" } },
      _count: { select: { sessions: true } },
    },
  });
  if (!role) return null;

  // Each skill's rating as it stood a week ago, for the "change this week" arrows and readiness trend.
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const skills = role.skills.map((s) => {
    const history = [...s.history].reverse();
    const before = history.filter((h) => h.createdAt <= weekAgo).pop();
    return { ...s, history, ratingWeekAgo: before ? before.rating : null };
  });
  // The weekly change compares the same skills then and now, so newly rated skills don't look like progress or decline.
  const comparable = skills.filter((s) => s.ratingWeekAgo != null);
  const now = readiness(comparable);
  const then = readiness(comparable.map((s) => ({ importance: s.importance, rating: s.ratingWeekAgo })));
  return {
    role,
    skills,
    readiness: readiness(skills),
    readinessChange: now != null && then != null ? now - then : null,
  };
}

export async function getActiveRoleId(userId: string) {
  const role = await prisma.targetRole.findFirst({ where: { userId, isActive: true }, select: { id: true } });
  return role?.id ?? null;
}

// Self-ratings set the starting point. Once interview evidence exists the rating follows the evidence instead,
// so changing a self-rating then only updates selfRating.
export async function rateSkills(userId: string, roleId: string, ratings: { skillId: string; rating: number }[]) {
  const role = await findRole(userId, roleId);
  if (!role) return false;
  const skills = await prisma.roleSkill.findMany({ where: { roleId, id: { in: ratings.map((r) => r.skillId) } } });
  const byId = new Map(skills.map((s) => [s.id, s]));
  const writes = ratings.flatMap(({ skillId, rating }) => {
    const skill = byId.get(skillId);
    if (!skill) return [];
    const followsSelf = skill.evidenceCount === 0;
    return [
      prisma.roleSkill.update({ where: { id: skillId }, data: { selfRating: rating, ...(followsSelf ? { rating } : {}) } }),
      ...(followsSelf && skill.rating !== rating ? [prisma.skillRatingEvent.create({ data: { skillId, rating, source: "SELF" } })] : []),
    ];
  });
  await prisma.$transaction(writes);
  return true;
}

export async function addSkill(userId: string, roleId: string, name: string) {
  const role = await findRole(userId, roleId);
  if (!role) return null;
  return prisma.roleSkill.upsert({
    where: { roleId_name: { roleId, name } },
    update: {},
    create: { roleId, name, category: role.isTechnical ? "TECHNICAL" : "DOMAIN", importance: 2 },
  });
}

export async function removeSkill(userId: string, roleId: string, skillId: string) {
  const role = await findRole(userId, roleId);
  if (!role) return false;
  const deleted = await prisma.roleSkill.deleteMany({ where: { id: skillId, roleId } });
  return deleted.count === 1;
}

// After the job description or CV changes: refresh descriptions and importance and add newly relevant skills,
// keeping every existing skill and its rating history.
export async function regenerateSkills(userId: string, roleId: string) {
  const role = await prisma.targetRole.findFirst({ where: { id: roleId, userId }, include: { skills: true } });
  if (!role) return false;
  const generated = await generateSkills(role, role.skills.map((s) => s.name));
  const existing = new Map(role.skills.map((s) => [s.name.toLowerCase(), s]));
  // isTechnical is left alone here: it may be the user's explicit choice from the edit form.
  await prisma.$transaction([
    ...generated.skills.map((s) => {
      const match = existing.get(s.name.toLowerCase());
      return match
        ? prisma.roleSkill.update({ where: { id: match.id }, data: { category: s.category, importance: s.importance, description: s.description } })
        : prisma.roleSkill.create({
            data: { roleId, name: s.name, category: s.category, importance: s.importance, description: s.description, selfRating: s.suggestedRating },
          });
    }),
  ]);
  return true;
}

// This week's plan: one goal for each of the three weakest skills (unrated counts as weakest). Goals already
// ticked off this week are kept; unfinished ones are replaced.
export async function generateGoals(userId: string, roleId: string) {
  const role = await prisma.targetRole.findFirst({ where: { id: roleId, userId }, include: { skills: true } });
  if (!role) return null;
  if (role.skills.length === 0) return "noSkills" as const;
  const weakest = weakestFirst(role.skills).slice(0, 3);
  const { goals } = await generateValidated(goalsPrompt({ title: role.title, level: role.level, targetDate: role.targetDate, skills: weakest }), generatedGoalsSchema);
  const skillByName = new Map(weakest.map((s) => [s.name.toLowerCase(), s.id]));
  const weekStart = currentWeekStart();
  await prisma.$transaction([
    prisma.weeklyGoal.deleteMany({ where: { roleId, weekStart, done: false } }),
    prisma.weeklyGoal.createMany({
      data: goals.map((g) => ({ roleId, weekStart, text: g.text, skillId: skillByName.get(g.skill.toLowerCase()) ?? null })),
    }),
  ]);
  return true;
}

export async function setGoalDone(userId: string, goalId: string, done: boolean) {
  const updated = await prisma.weeklyGoal.updateMany({ where: { id: goalId, role: { userId } }, data: { done } });
  return updated.count === 1;
}

// Starts an ordinary interview session aimed at one skill of the role (the weakest if none is given). The skill
// becomes a private custom topic so the session shows up normally in history.
export async function startPractice(userId: string, roleId: string, skillId?: string) {
  const role = await prisma.targetRole.findFirst({ where: { id: roleId, userId }, include: { skills: true } });
  if (!role) return null;
  if (role.skills.length === 0) return "noSkills" as const;
  const skill = skillId ? role.skills.find((s) => s.id === skillId) : weakestFirst(role.skills)[0];
  if (!skill) return null;
  const track = role.title.slice(0, 60);
  const topic = await prisma.topic.upsert({
    where: { name_track_ownerId: { name: skill.name, track, ownerId: userId } },
    update: {},
    create: { name: skill.name, track, isCustom: true, ownerId: userId },
  });
  return prisma.interviewSession.create({
    data: { userId, topicId: topic.id, track, difficulty: role.level, roleId, focusSkill: skill.name },
  });
}

// Starts a full mock interview for the role (see ./mock.ts). Questions are generated round by round as usual.
export async function startMock(userId: string, roleId: string) {
  const role = await prisma.targetRole.findFirst({ where: { id: roleId, userId } });
  if (!role) return null;
  const track = role.title.slice(0, 60);
  const topic = await prisma.topic.upsert({
    where: { name_track_ownerId: { name: "Mock interview", track, ownerId: userId } },
    update: {},
    create: { name: "Mock interview", track, isCustom: true, ownerId: userId },
  });
  return prisma.interviewSession.create({ data: { userId, topicId: topic.id, track, difficulty: role.level, roleId, mode: "MOCK" } });
}

// Role context for question generation, or undefined for sessions not tied to a role.
export async function roleContextForSession(roleId: string | null, focusSkill: string | null): Promise<RoleContext | undefined> {
  if (!roleId) return undefined;
  const role = await prisma.targetRole.findUnique({ where: { id: roleId }, include: { skills: { select: { name: true } } } });
  if (!role) return undefined;
  return {
    title: role.title,
    isTechnical: role.isTechnical,
    skills: role.skills.map((s) => s.name),
    focusSkill,
    jobDescription: role.jobDescription,
  };
}

// A graded answer is evidence for the skills its question was tagged with: move each rating toward score / 2.
export async function applyEvidence(roleId: string, skillNames: string[], score: number) {
  if (skillNames.length === 0) return;
  const evidence = clampRating(score / 2);
  const skills = await prisma.roleSkill.findMany({ where: { roleId, name: { in: skillNames } } });
  await prisma.$transaction(
    skills.flatMap((s) => {
      const rating = Math.round(clampRating(s.rating == null ? evidence : s.rating * (1 - EVIDENCE_WEIGHT) + evidence * EVIDENCE_WEIGHT) * 10) / 10;
      return [
        prisma.roleSkill.update({ where: { id: s.id }, data: { rating, evidenceCount: { increment: 1 } } }),
        prisma.skillRatingEvent.create({ data: { skillId: s.id, rating, source: "INTERVIEW" } }),
      ];
    })
  );
}
