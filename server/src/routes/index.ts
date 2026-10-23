import { Router } from "express";
import { authRouter } from "./auth.routes";
import { topicsRouter } from "./topics.routes";
import { sessionsRouter, questionsRouter } from "./sessions.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/topics", topicsRouter);
apiRouter.use("/sessions", sessionsRouter);
apiRouter.use("/questions", questionsRouter);
