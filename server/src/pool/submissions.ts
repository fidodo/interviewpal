import { z } from "zod";
import { prisma } from "../db/prisma";
import { Difficulty } from "../types";
import { insert, presetTopics } from "./fill";
import { normaliseQuestion, questionChecksum } from "./sources";

// "Submit a question you were asked": users report real interview questions; the admin approves or rejects each one
// on /admin/questions. Nothing reaches the pool (or anyone else) until it's approved.

export const MAX_PENDING_PER_USER = 5;

export const submissionSchema = z.object({
  text: z.string().trim().min(10, "Write the question out (at least 10 characters).").max(1000, "Keep it under 1,000 characters."),
  track: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(1).max(120),
  level: z.nativeEnum(Difficulty),
  // Shown in the credit if the question is approved ("Reported at Google").
  company: z
    .string()
    .trim()
    .max(80, "Keep the company under 80 characters.")
    .optional()
    .transform((v) => v || null),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

async function isPresetTopic(track: string, topic: string) {
  const row = await prisma.topic.findFirst({ where: { track, name: topic, isCustom: false, ownerId: null }, select: { id: true } });
  return !!row;
}

const OWN_SELECT = { id: true, text: true, track: true, topic: true, level: true, company: true, status: true, createdAt: true } as const;

export async function mySubmissions(userId: string) {
  const [submissions, topics] = await Promise.all([
    prisma.poolSubmission.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: OWN_SELECT }),
    presetTopics(),
  ]);
  return { submissions, topics, maxPending: MAX_PENDING_PER_USER };
}

export type SubmitResult =
  | { ok: true; submission: Awaited<ReturnType<typeof prisma.poolSubmission.create>> }
  | { ok: false; status: number; error: string };

export async function submit(userId: string, input: SubmissionInput): Promise<SubmitResult> {
  if (!(await isPresetTopic(input.track, input.topic))) return { ok: false, status: 400, error: "Pick one of the listed topics." };
  const pending = await prisma.poolSubmission.count({ where: { userId, status: "PENDING" } });
  if (pending >= MAX_PENDING_PER_USER) {
    return { ok: false, status: 429, error: `You have ${MAX_PENDING_PER_USER} questions waiting for review. Send more once some are reviewed.` };
  }
  const inPool = await prisma.poolItem.findUnique({ where: { checksum: questionChecksum("INTERVIEW", input.text) }, select: { id: true } });
  if (inPool) return { ok: false, status: 409, error: "That question is already in the pool. Thanks for sharing it!" };
  const mine = await prisma.poolSubmission.findMany({ where: { userId, status: "PENDING" }, select: { text: true } });
  if (mine.some((m) => normaliseQuestion(m.text) === normaliseQuestion(input.text))) {
    return { ok: false, status: 409, error: "You've already sent this question. It's waiting for review." };
  }
  const submission = await prisma.poolSubmission.create({ data: { userId, ...input } });
  return { ok: true, submission };
}

// Withdraw a question that hasn't been reviewed yet.
export async function withdraw(userId: string, id: string) {
  const { count } = await prisma.poolSubmission.deleteMany({ where: { id, userId, status: "PENDING" } });
  return count === 1;
}

// Admin: submissions to review (oldest first), and the latest reviewed ones. No submitter details are shown.
export async function forReview() {
  const [pending, reviewed, pendingCount, topics] = await Promise.all([
    prisma.poolSubmission.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, select: OWN_SELECT }),
    prisma.poolSubmission.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 10, select: { ...OWN_SELECT, reviewedAt: true } }),
    prisma.poolSubmission.count({ where: { status: "PENDING" } }),
    presetTopics(),
  ]);
  return { pending, reviewed, pendingCount, topics };
}

export function creditFor(company: string | null) {
  return `${company ? `Reported at ${company}. ` : ""}Shared by an InterviewPal user.`;
}

// Approve: the admin may correct the wording, topic, level and company first. The status change is claimed with a
// conditional write, so two clicks (or two tabs) approve once. A question already in the pool is linked to that item.
export async function approve(id: string, input: SubmissionInput): Promise<{ ok: true; added: boolean } | { ok: false; status: number; error: string }> {
  if (!(await isPresetTopic(input.track, input.topic))) return { ok: false, status: 400, error: "Pick one of the listed topics." };
  const { count } = await prisma.poolSubmission.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date(), ...input } });
  if (count === 0) return { ok: false, status: 409, error: "This question has already been reviewed." };
  try {
    const added = await insert({
      kind: "INTERVIEW",
      level: input.level,
      track: input.track,
      topic: input.topic,
      checksumText: input.text,
      payload: { text: input.text, type: "VERBAL", codeSpec: null },
      source: "user",
      credit: creditFor(input.company),
    });
    const item = await prisma.poolItem.findUnique({ where: { checksum: questionChecksum("INTERVIEW", input.text) }, select: { id: true } });
    await prisma.poolSubmission.update({ where: { id }, data: { poolItemId: item?.id ?? null } });
    return { ok: true, added };
  } catch (err) {
    // Put it back in the queue so it can be approved again.
    await prisma.poolSubmission.updateMany({ where: { id, status: "APPROVED", poolItemId: null }, data: { status: "PENDING", reviewedAt: null } });
    throw err;
  }
}

export async function reject(id: string) {
  const { count } = await prisma.poolSubmission.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", reviewedAt: new Date() } });
  return count === 1;
}
