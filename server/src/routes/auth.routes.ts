import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", authLimiter, asyncHandler(authController.register));
authRouter.post("/login", authLimiter, asyncHandler(authController.login));
authRouter.post("/google", authLimiter, asyncHandler(authController.googleLogin));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
