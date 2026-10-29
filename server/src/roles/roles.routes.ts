import { Router } from "express";
import * as rolesController from "./roles.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiDailyLimiter, aiLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: services look roles up by userId and 404 otherwise.
export const rolesRouter = Router();
const aiGuard = [requireVerified, aiLimiter, aiDailyLimiter];

rolesRouter.use(requireAuth);

rolesRouter.get("/", asyncHandler(rolesController.listRoles));
rolesRouter.get("/active", asyncHandler(rolesController.getActiveRole));
rolesRouter.post("/", ...aiGuard, asyncHandler(rolesController.createRole));
rolesRouter.get("/:id", asyncHandler(rolesController.getRole));
rolesRouter.patch("/:id", asyncHandler(rolesController.updateRole));
rolesRouter.delete("/:id", asyncHandler(rolesController.deleteRole));
rolesRouter.post("/:id/activate", asyncHandler(rolesController.activateRole));

rolesRouter.put("/:id/ratings", asyncHandler(rolesController.rateSkills));
rolesRouter.post("/:id/skills", asyncHandler(rolesController.addSkill));
rolesRouter.delete("/:id/skills/:skillId", asyncHandler(rolesController.removeSkill));
rolesRouter.post("/:id/skills/regenerate", ...aiGuard, asyncHandler(rolesController.regenerateSkills));

rolesRouter.post("/:id/goals/generate", ...aiGuard, asyncHandler(rolesController.generateGoals));
rolesRouter.patch("/:id/goals/:goalId", asyncHandler(rolesController.setGoalDone));

rolesRouter.post("/:id/practice", asyncHandler(rolesController.startPractice));
rolesRouter.post("/:id/mock", asyncHandler(rolesController.startMock));
