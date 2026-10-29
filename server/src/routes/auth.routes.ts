import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth.middleware";
import { accountLimiter, authLimiter, emailLinkLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", authLimiter, asyncHandler(authController.register));
authRouter.post("/login", authLimiter, asyncHandler(authController.login));
authRouter.post("/google", authLimiter, asyncHandler(authController.googleLogin));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.post("/logout-all", requireAuth, asyncHandler(authController.logoutAll));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
authRouter.get("/config", asyncHandler(authController.config));
authRouter.post("/verify-email", emailLinkLimiter, asyncHandler(authController.verifyEmail));
authRouter.post("/verify-email/resend", requireAuth, emailLinkLimiter, asyncHandler(authController.resendVerification));
authRouter.post("/password/forgot", emailLinkLimiter, asyncHandler(authController.forgotPassword));
authRouter.post("/password/reset", emailLinkLimiter, asyncHandler(authController.resetPassword));
authRouter.delete("/account", requireAuth, accountLimiter, asyncHandler(authController.deleteAccount));
