import { Router } from "express";
import * as kidsController from "./kids.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { kidsAiLimiter, kidsDailyLimiter, pinLimiter } from "../middleware/rateLimit";

const aiGuard = [requireVerified, kidsAiLimiter, kidsDailyLimiter];

// Everything here is scoped to the signed-in parent: services look children/challenges up by parentId and 404 otherwise.
export const kidsRouter = Router();

kidsRouter.use(requireAuth);

kidsRouter.get("/children", asyncHandler(kidsController.listChildren));
kidsRouter.post("/children", asyncHandler(kidsController.createChild));
kidsRouter.patch("/children/:id", asyncHandler(kidsController.updateChild));
kidsRouter.delete("/children/:id", asyncHandler(kidsController.deleteChild));
kidsRouter.get("/children/:id/activity", asyncHandler(kidsController.getActivity));

kidsRouter.post("/pin", pinLimiter, asyncHandler(kidsController.setPin));
kidsRouter.post("/pin/verify", pinLimiter, asyncHandler(kidsController.verifyPin));
kidsRouter.post("/pin/reset", pinLimiter, asyncHandler(kidsController.resetPin));

kidsRouter.get("/courses", asyncHandler(kidsController.listCourses));
kidsRouter.get("/children/:childId/courses/:slug", asyncHandler(kidsController.getCourseProgress));
kidsRouter.patch("/children/:childId/courses/:slug", asyncHandler(kidsController.setLevel));
kidsRouter.post("/children/:childId/courses/:slug/challenges", ...aiGuard, asyncHandler(kidsController.nextChallenge));

kidsRouter.get("/challenges/:id", asyncHandler(kidsController.getChallenge));
kidsRouter.post("/challenges/:id/attempts", ...aiGuard, asyncHandler(kidsController.submitAttempt));
kidsRouter.post("/challenges/:id/help", ...aiGuard, asyncHandler(kidsController.askHelp));
