import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { emailEnabled, env } from "../config/env";
import { prisma } from "../db/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
}

interface TokenPayload {
  userId: string;
  email: string;
  tv?: number;
}

// Checks the JWT and that it hasn't been revoked: its `tv` must equal the user's current tokenVersion
// (logout and password reset bump it). Tokens issued before versions existed carry no `tv` and count as 0.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true, isAdmin: true, emailVerified: true },
    });
    if (!user || user.tokenVersion !== (payload.tv ?? 0)) {
      res.status(401).json({ error: "Your session has ended. Please log in again." });
      return;
    }
    req.userId = payload.userId;
    req.isAdmin = user.isAdmin;
    req.emailVerified = user.emailVerified;
    next();
  } catch (err) {
    next(err);
  }
}

// AI routes cost money, so once email is set up they need a verified address. Without email configured
// nobody could verify, so the check is skipped rather than locking everyone out.
export function requireVerified(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!emailEnabled || req.emailVerified || req.isAdmin) return next();
  res.status(403).json({ error: "Please confirm your email first. Check your inbox for the link, or resend it from the banner at the top." });
}
