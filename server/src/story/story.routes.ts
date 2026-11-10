import { Router } from "express";
import * as storyController from "./story.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter, conversationLimiter, drillLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look stories up by userId and 404 otherwise. The AI routes
// share the interview allowance.
export const storyRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

storyRouter.use(requireAuth);

storyRouter.get("/", asyncHandler(storyController.listStories));
storyRouter.post("/", ...aiGuard, asyncHandler(storyController.createStory));
// A 1-minute drill: the prompt comes from a fixed list, so no AI allowance is used.
storyRouter.post("/drill", drillLimiter, asyncHandler(storyController.createDrill));
storyRouter.get("/:id", asyncHandler(storyController.getStory));
storyRouter.post("/:id/takes", ...aiGuard, asyncHandler(storyController.submitTake));
// A conversation's next line: an AI call, but on its own daily budget so a 6-turn conversation doesn't use up the
// interview allowance.
storyRouter.post("/:id/reply", requireVerified, conversationLimiter, asyncHandler(storyController.conversationReply));
// No AI call; aiLimiter only guards against row spam, and it doesn't use the daily allowance.
storyRouter.post("/:id/again", aiLimiter, asyncHandler(storyController.practiseAgain));
storyRouter.delete("/:id", asyncHandler(storyController.deleteStory));
