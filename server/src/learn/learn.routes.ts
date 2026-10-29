import { Router } from "express";
import * as learnController from "./learn.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look courses up by userId and 404 otherwise.
export const learnRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

learnRouter.use(requireAuth);

learnRouter.get("/courses", asyncHandler(learnController.listCourses));
learnRouter.get("/courses/for-skill/:skillId", asyncHandler(learnController.findSkillCourse));
learnRouter.post("/courses", ...aiGuard, asyncHandler(learnController.createCourse));
learnRouter.get("/courses/:id", asyncHandler(learnController.getCourse));
learnRouter.delete("/courses/:id", asyncHandler(learnController.deleteCourse));

learnRouter.get("/lessons/:id", asyncHandler(learnController.getLesson));
learnRouter.post("/lessons/:id/generate", ...aiGuard, asyncHandler(learnController.generateLesson));

// Multiple choice is marked on the server without the AI, so it isn't rate limited; written answers are.
learnRouter.post("/questions/:id/answer", asyncHandler(learnController.answerChoice));
learnRouter.post("/questions/:id/answer-written", ...aiGuard, asyncHandler(learnController.answerWritten));

learnRouter.get("/review", asyncHandler(learnController.dueReviews));
