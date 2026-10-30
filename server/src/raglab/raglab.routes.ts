import { Router } from "express";
import * as labController from "./raglab.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireVerified } from "../middleware/auth.middleware";
import { aiLimiter, ragGradeDailyLimiter, ragRunLimiter, ragSdkLimiter } from "../middleware/rateLimit";

// Everything is scoped to the signed-in user: projects and runs are looked up by userId and 404 otherwise.
export const raglabRouter = Router();

raglabRouter.use(requireAuth);

raglabRouter.get("/levels", labController.getLevels);
raglabRouter.get("/corpus", labController.getCorpus);
raglabRouter.get("/projects", asyncHandler(labController.listProjects));
raglabRouter.post("/projects", asyncHandler(labController.createProject));
raglabRouter.get("/projects/:id", asyncHandler(labController.getProject));
raglabRouter.put("/projects/:id/code", asyncHandler(labController.saveCode));
raglabRouter.delete("/projects/:id", asyncHandler(labController.deleteProject));
raglabRouter.post("/projects/:id/attempts", requireVerified, ragRunLimiter, asyncHandler(labController.startAttempt));
// Grading calls the AI judge: the interview's hourly burst limit, plus the lab's own daily allowance (separate from
// the interview one, so practising here can't use up interview questions).
raglabRouter.post("/attempts/:id/grade", requireVerified, aiLimiter, ragGradeDailyLimiter, asyncHandler(labController.gradeAttempt));

// The toolkit: burst-limited here, with daily budgets charged inside each call.
raglabRouter.post("/sdk/embed", requireVerified, ragSdkLimiter, asyncHandler(labController.sdkEmbed));
raglabRouter.post("/sdk/llm", requireVerified, ragSdkLimiter, asyncHandler(labController.sdkLlm));
