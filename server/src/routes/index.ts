import { Router } from "express";
import { authRouter } from "./auth.routes";
import { topicsRouter } from "./topics.routes";
import { sessionsRouter, questionsRouter } from "./sessions.routes";
import { kidsRouter } from "../kids/kids.routes";
import { rolesRouter } from "../roles/roles.routes";
import { learnRouter } from "../learn/learn.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/topics", topicsRouter);
apiRouter.use("/sessions", sessionsRouter);
apiRouter.use("/questions", questionsRouter);
apiRouter.use("/kids", kidsRouter);
apiRouter.use("/roles", rolesRouter);
apiRouter.use("/learn", learnRouter);
