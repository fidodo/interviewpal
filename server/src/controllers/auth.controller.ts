import { Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";
import { emailEnabled, env } from "../config/env";
import { AuthedRequest } from "../middleware/auth.middleware";

function setSessionCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const passwordSchema = z.string().min(8).max(200);

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});

export async function register(req: AuthedRequest, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and a password of at least 8 characters" });
    return;
  }
  const result = await authService.register(parsed.data.email, parsed.data.password);
  if ("error" in result) {
    res.status(409).json({ error: "An account with this email already exists. Try logging in instead." });
    return;
  }
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function login(req: AuthedRequest, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }
  const result = await authService.login(parsed.data.email, parsed.data.password);
  if (!result) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
}

const googleLoginSchema = z.object({
  credential: z.string().min(1).max(5000),
});

export async function googleLogin(req: AuthedRequest, res: Response) {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing Google credential" });
    return;
  }
  const result = await authService.loginWithGoogle(parsed.data.credential);
  if (!result) {
    res.status(401).json({ error: "Google sign-in failed" });
    return;
  }
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
}

// Signs out this browser only, so a parent logging out doesn't also end a child's kid-mode session elsewhere.
export async function logout(_req: AuthedRequest, res: Response) {
  res.clearCookie("token");
  res.status(204).send();
}

// Revokes every existing token (bumps tokenVersion), e.g. after using a shared computer.
export async function logoutAll(req: AuthedRequest, res: Response) {
  await authService.logoutEverywhere(req.userId!);
  res.clearCookie("token");
  res.status(204).send();
}

export async function me(req: AuthedRequest, res: Response) {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await authService.getUserById(req.userId);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
}

// Lets the client know whether email features (verification, password reset) are switched on.
export async function config(_req: AuthedRequest, res: Response) {
  res.json({ emailEnabled });
}

const tokenSchema = z.object({ token: z.string().min(10).max(200) });

export async function verifyEmail(req: AuthedRequest, res: Response) {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success || !(await authService.verifyEmail(parsed.data.token))) {
    res.status(400).json({ error: "This link is invalid or has expired. Log in and send a new one." });
    return;
  }
  res.status(204).send();
}

export async function resendVerification(req: AuthedRequest, res: Response) {
  if (!emailEnabled) {
    res.status(503).json({ error: "Email isn't set up on this site yet." });
    return;
  }
  await authService.resendVerification(req.userId!);
  res.status(204).send();
}

export async function forgotPassword(req: AuthedRequest, res: Response) {
  if (!emailEnabled) {
    res.status(503).json({ error: "Password reset by email isn't set up on this site yet. If you signed up with Google, log in with Google instead." });
    return;
  }
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  await authService.requestPasswordReset(parsed.data.email);
  // Same reply whether or not the account exists.
  res.status(204).send();
}

export async function resetPassword(req: AuthedRequest, res: Response) {
  const parsed = z.object({ token: z.string().min(10).max(200), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a password of at least 8 characters" });
    return;
  }
  const result = await authService.resetPassword(parsed.data.token, parsed.data.password);
  if (!result) {
    res.status(400).json({ error: "This link is invalid or has expired. Ask for a new one." });
    return;
  }
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
}

export async function deleteAccount(req: AuthedRequest, res: Response) {
  const parsed = z.object({ password: z.string().max(200).optional(), credential: z.string().max(5000).optional() }).safeParse(req.body ?? {});
  if (!parsed.success || !(await authService.deleteAccount(req.userId!, parsed.data))) {
    res.status(403).json({ error: "That didn't confirm it's you. Check your password and try again." });
    return;
  }
  res.clearCookie("token");
  res.status(204).send();
}
