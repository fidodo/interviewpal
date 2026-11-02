import { Router } from "express";
import * as termsController from "./terms.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter, termsLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: progress rows are looked up by userId and 404 otherwise. AI routes share
// the interview allowance; the rest (lists, starter decks, Recognise and self-rated Recall) cost no AI call.
export const termsRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

termsRouter.use(requireAuth, termsLimiter);

termsRouter.get("/", asyncHandler(termsController.listTerms));
termsRouter.get("/summary", asyncHandler(termsController.getSummary));
termsRouter.get("/decks", asyncHandler(termsController.listDecks));
termsRouter.post("/decks/:deck/add", asyncHandler(termsController.addDeck));
termsRouter.post("/generate", ...aiGuard, asyncHandler(termsController.generateDeck));
termsRouter.post("/", ...aiGuard, asyncHandler(termsController.addTerm));
termsRouter.get("/review", asyncHandler(termsController.nextCard));
termsRouter.post("/review/:termId/recognise", asyncHandler(termsController.answerRecognise));
termsRouter.get("/review/:termId/reveal", asyncHandler(termsController.revealRecall));
termsRouter.post("/review/:termId/recall", asyncHandler(termsController.answerRecallSelf));
termsRouter.post("/review/:termId/recall/mark", ...aiGuard, asyncHandler(termsController.markRecall));
termsRouter.post("/review/:termId/use", ...aiGuard, asyncHandler(termsController.answerUse));
termsRouter.delete("/:id", asyncHandler(termsController.removeTerm));
