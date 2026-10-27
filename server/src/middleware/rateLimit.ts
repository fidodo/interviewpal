import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AuthedRequest } from "./auth.middleware";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "You're moving through questions faster than we can keep up with. Try again shortly." },
});

// Slows down guessing the 4-digit kids PIN without sharing the login limiter's per-IP budget.
export const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "Too many PIN tries. Wait 15 minutes and try again." },
});

// Separate budget for the kids section so a busy learner can't use up the parent's interview quota (or vice versa).
export const kidsAiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "Pal needs a little rest! Take a break and try again in a while." },
});
