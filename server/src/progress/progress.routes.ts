import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AuthedRequest, requireAuth } from "../middleware/auth.middleware";
import { progressLimiter } from "../middleware/rateLimit";
import { progress } from "./progress.service";

// Weekly trends across interview answers, retakes and Speak takes. Read-only, no AI.
export const progressRouter = Router();
progressRouter.use(requireAuth);
progressRouter.get(
  "/",
  progressLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await progress(req.userId!));
  })
);
