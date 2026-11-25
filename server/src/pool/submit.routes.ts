import { Router, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AuthedRequest, requireAuth, requireVerified } from "../middleware/auth.middleware";
import { poolVoteLimiter, submissionLimiter } from "../middleware/rateLimit";
import { mySubmissions, submissionSchema, submit, withdraw } from "./submissions";

// "Submit a question you were asked" (/questions/submit). A user sees only their own submissions.
export const submitRouter = Router();
submitRouter.use(requireAuth);

submitRouter.get(
  "/",
  poolVoteLimiter,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    res.json(await mySubmissions(req.userId!));
  })
);

submitRouter.post(
  "/",
  requireVerified,
  submissionLimiter,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the question and try again." });
      return;
    }
    const result = await submit(req.userId!, parsed.data);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ submission: result.submission });
  })
);

submitRouter.delete(
  "/:id",
  submissionLimiter,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!(await withdraw(req.userId!, String(req.params.id).slice(0, 64)))) {
      res.status(404).json({ error: "Question not found, or already reviewed." });
      return;
    }
    res.status(204).end();
  })
);
