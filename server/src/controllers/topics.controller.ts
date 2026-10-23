import { Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { AuthedRequest } from "../middleware/auth.middleware";

export async function listTopics(req: AuthedRequest, res: Response) {
  const track = req.query.track as string | undefined;
  const topics = await prisma.topic.findMany({
    where: track ? { track } : undefined,
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
  const topic = await prisma.topic.upsert({
    where: { name_track: { name, track } },
    update: {},
    create: { name, track, isCustom: true },
  });
  res.status(201).json({ topic });
}
