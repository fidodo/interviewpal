import { Router } from "express";
import * as topicsController from "../controllers/topics.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth.middleware";

export const topicsRouter = Router();

topicsRouter.use(requireAuth);
topicsRouter.get("/", asyncHandler(topicsController.listTopics));
topicsRouter.post("/", asyncHandler(topicsController.createTopic));
