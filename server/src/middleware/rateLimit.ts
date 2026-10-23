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
