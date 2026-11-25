import { Router, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { AuthedRequest, requireAdmin, requireAuth } from "../middleware/auth.middleware";
import { SERVE_POOL, setSetting } from "./settings";
import { cancelRun, DEFAULT_AI_CAP, poolStatus, startRun, step } from "./update.service";
import { approve, forReview, reject, submissionSchema } from "./submissions";

// The question pool's admin page (/admin/questions). Everyone else gets a 404 from requireAdmin.
export const poolAdminRouter = Router();
poolAdminRouter.use(requireAuth, requireAdmin);

poolAdminRouter.get(
  "/",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    res.json(await poolStatus());
  })
);

// The "Serve from pool" switch: off means every question is written by the AI, exactly as before the pool.
poolAdminRouter.put(
  "/serve",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = z.object({ on: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Send { on: true | false }." });
      return;
    }
    await setSetting(SERVE_POOL, parsed.data.on ? "on" : "off");
    res.json(await poolStatus());
  })
);

poolAdminRouter.post(
  "/update",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = z.object({ cap: z.number().int().min(1).max(200).default(DEFAULT_AI_CAP) }).safeParse(req.body ?? {});
    const { busy, run } = await startRun(parsed.success ? parsed.data.cap : DEFAULT_AI_CAP);
    res.status(busy ? 409 : 201).json({ busy, runId: run.id, ...(busy ? { error: "An update is already running." } : {}) });
  })
);

poolAdminRouter.post(
  "/update/:id/step",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { run, busy } = await step(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Update not found" });
      return;
    }
    res.json({ busy: !!busy, status: run.status, aiCalls: run.aiCalls, added: run.added, retired: run.retired, log: JSON.parse(run.log || "[]"), phase: JSON.parse(run.state || "{}").phase });
  })
);

poolAdminRouter.post(
  "/update/:id/cancel",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const run = await cancelRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Update not found" });
      return;
    }
    res.json({ status: run.status });
  })
);

// Submitted questions waiting for review.
poolAdminRouter.get(
  "/submissions",
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    res.json(await forReview());
  })
);

// Approve, with any corrections to the wording, topic, level or company.
poolAdminRouter.post(
  "/submissions/:id/approve",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the question and try again." });
      return;
    }
    const result = await approve(String(req.params.id), parsed.data);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ added: result.added, ...(await forReview()) });
  })
);

poolAdminRouter.post(
  "/submissions/:id/reject",
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!(await reject(String(req.params.id)))) {
      res.status(409).json({ error: "This question has already been reviewed." });
      return;
    }
    res.json(await forReview());
  })
);
