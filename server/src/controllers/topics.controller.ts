import { Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { AuthedRequest } from "../middleware/auth.middleware";
import { visibleTopics } from "../services/topic.service";

export async function listTopics(req: AuthedRequest, res: Response) {
  const track = typeof req.query.track === "string" ? req.query.track : undefined;
  const topics = await prisma.topic.findMany({
    where: { ...visibleTopics(req.userId!), ...(track ? { track } : {}) },
    orderBy: [{ isCustom: "asc" }, { name: "asc" }],
  });
  res.json({ topics });
}

const createTopicSchema = z.object({
  name: z.string().min(1).max(120),
  track: z.string().min(1).max(60),
});

export async function createTopic(req: AuthedRequest, res: Response) {
  const parsed = createTopicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid topic" });
    return;
  }
  const { name, track } = parsed.data;
  const ownerId = req.userId!;
  const topic = await prisma.topic.upsert({
    where: { name_track_ownerId: { name, track, ownerId } },
    update: {},
    create: { name, track, isCustom: true, ownerId },
  });
  res.status(201).json({ topic });
}
