import { Router } from "express";
import * as sessionsController from "../controllers/sessions.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { aiLimiter } from "../middleware/rateLimit";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);
sessionsRouter.post("/", asyncHandler(sessionsController.createSession));
sessionsRouter.get("/", asyncHandler(sessionsController.listSessions));
sessionsRouter.get("/:id", asyncHandler(sessionsController.getSessionDetail));
sessionsRouter.post("/:id/questions", aiLimiter, asyncHandler(sessionsController.generateNextQuestion));
sessionsRouter.post("/:id/end", asyncHandler(sessionsController.endSession));
sessionsRouter.get("/:id/summary", asyncHandler(sessionsController.getSummary));

export const questionsRouter = Router();
questionsRouter.use(requireAuth);
questionsRouter.post("/:id/answer", aiLimiter, asyncHandler(sessionsController.submitAnswer));
