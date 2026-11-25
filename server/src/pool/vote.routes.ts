import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth.middleware";
import { poolVoteLimiter } from "../middleware/rateLimit";

// "Was this a realistic interview question?" One vote per user and pool item, changeable. Only someone who was given
// the item (in an interview, a Debug exercise or a System design question) can vote on it. The admin update retires
// items most people marked "Not realistic" (update.service.ts, retireUnrealistic).
export const poolVoteRouter = Router();
poolVoteRouter.use(requireAuth, poolVoteLimiter);

const voteSchema = z.object({ realistic: z.boolean() });

poolVoteRouter.put(
  "/items/:id/vote",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = voteSchema.safeParse(req.body);
    const itemId = req.params.id;
    if (!parsed.success || typeof itemId !== "string" || itemId.length > 64) {
      res.status(400).json({ error: "Send { realistic: true | false }." });
      return;
    }
    const userId = req.userId!;
    const given = await prisma.poolItem.findFirst({
      where: {
        id: itemId,
        OR: [{ questions: { some: { session: { userId } } } }, { debugs: { some: { userId } } }, { designs: { some: { userId } } }],
      },
      select: { id: true },
    });
    if (!given) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    const { realistic } = parsed.data;
    await prisma.poolVote.upsert({ where: { userId_itemId: { userId, itemId } }, create: { userId, itemId, realistic }, update: { realistic } });
    res.json({ realistic });
  })
);
