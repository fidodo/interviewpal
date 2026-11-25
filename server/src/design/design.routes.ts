import { Router } from "express";
import * as designController from "./design.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look questions up by userId and 404 otherwise.
export const designRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

designRouter.use(requireAuth);

designRouter.get("/", asyncHandler(designController.listChallenges));
designRouter.post("/", ...aiGuard, asyncHandler(designController.createChallenge));
designRouter.get("/:id", asyncHandler(designController.getChallenge));
// Hints were written with the question, so revealing one costs no AI call.
designRouter.post("/:id/hint", asyncHandler(designController.useHint));
designRouter.post("/:id/submit", ...aiGuard, asyncHandler(designController.submitDesign));
// After a mark: improve and resubmit, or open the model answer (which ends resubmitting). Neither calls the AI.
designRouter.post("/:id/improve", asyncHandler(designController.improve));
designRouter.post("/:id/answer", asyncHandler(designController.showAnswer));
