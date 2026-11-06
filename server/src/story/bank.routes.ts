import { Router } from "express";
import * as bankController from "./bank.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter, bankLimiter } from "../middleware/rateLimit";

// The story bank. Every query is scoped by userId. Only the AI routes (suggesting tags, judging a pick) use the
// shared allowance; the rest has a plain per-user limit.
export const bankRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

bankRouter.use(requireAuth);

bankRouter.get("/", bankLimiter, asyncHandler(bankController.listBank));
bankRouter.post("/", bankLimiter, asyncHandler(bankController.createEntry));
bankRouter.post("/suggest", ...aiGuard, asyncHandler(bankController.suggest));
bankRouter.get("/drill", bankLimiter, bankController.drill);
bankRouter.post("/drill/judge", ...aiGuard, asyncHandler(bankController.judge));
bankRouter.put("/:id", bankLimiter, asyncHandler(bankController.updateEntry));
bankRouter.delete("/:id", bankLimiter, asyncHandler(bankController.deleteEntry));
