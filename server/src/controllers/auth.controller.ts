import { Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";
import { env } from "../config/env";
import { AuthedRequest } from "../middleware/auth.middleware";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
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
  res.cookie("token", result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ user: result.user });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  res.cookie("token", result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ user: result.user });
}

const googleLoginSchema = z.object({
  credential: z.string().min(1),
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
  res.cookie("token", result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ user: result.user });
}

export async function logout(_req: AuthedRequest, res: Response) {
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
