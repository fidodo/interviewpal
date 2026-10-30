import { Router } from "express";
import * as storyController from "./story.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look stories up by userId and 404 otherwise. The AI routes
// share the interview allowance.
export const storyRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

storyRouter.use(requireAuth);

storyRouter.get("/", asyncHandler(storyController.listStories));
storyRouter.post("/", ...aiGuard, asyncHandler(storyController.createStory));
storyRouter.get("/:id", asyncHandler(storyController.getStory));
storyRouter.post("/:id/takes", ...aiGuard, asyncHandler(storyController.submitTake));
storyRouter.delete("/:id", asyncHandler(storyController.deleteStory));
