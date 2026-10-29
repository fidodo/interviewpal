import { Router } from "express";
import * as sessionsController from "../controllers/sessions.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter, endLimiter } from "../middleware/rateLimit";

// Every route that calls the AI provider: verified email (once email is set up), burst limit, daily allowance.
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);
sessionsRouter.post("/", asyncHandler(sessionsController.createSession));
sessionsRouter.get("/", asyncHandler(sessionsController.listSessions));
sessionsRouter.get("/:id", asyncHandler(sessionsController.getSessionDetail));
sessionsRouter.delete("/:id", asyncHandler(sessionsController.deleteSession));
sessionsRouter.post("/:id/questions", ...aiGuard, asyncHandler(sessionsController.generateNextQuestion));
// Not behind the daily allowance: hitting it mid-interview must never stop you finishing. It still needs a verified
// email and has its own per-user limit, and a session's summary is only ever generated once.
sessionsRouter.post("/:id/end", requireVerified, endLimiter, asyncHandler(sessionsController.endSession));
sessionsRouter.get("/:id/summary", asyncHandler(sessionsController.getSummary));

export const questionsRouter = Router();
questionsRouter.use(requireAuth);
questionsRouter.post("/:id/answer", ...aiGuard, asyncHandler(sessionsController.submitAnswer));
