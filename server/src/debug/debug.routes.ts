import { Router } from "express";
import * as debugController from "./debug.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look challenges up by userId and 404 otherwise.
export const debugRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

debugRouter.use(requireAuth);

debugRouter.get("/", asyncHandler(debugController.listChallenges));
debugRouter.post("/", ...aiGuard, asyncHandler(debugController.createChallenge));
debugRouter.get("/:id", asyncHandler(debugController.getChallenge));
// Hints were written with the challenge, so revealing one costs no AI call.
debugRouter.post("/:id/hint", asyncHandler(debugController.useHint));
debugRouter.post("/:id/submit", ...aiGuard, asyncHandler(debugController.submitFix));
