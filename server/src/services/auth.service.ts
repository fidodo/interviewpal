import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

const googleClient = new OAuth2Client(env.googleClientId);

function issueToken(user: { id: string; email: string }) {
  return jwt.sign({ userId: user.id, email: user.email }, env.jwtSecret, { expiresIn: "7d" });
}

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "exists" as const };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { token: issueToken(user), user: { id: user.id, email: user.email } };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { token: issueToken(user), user: { id: user.id, email: user.email } };
}

export async function loginWithGoogle(idToken: string) {
  const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) return null;

  const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: { googleId: payload.sub },
    create: { email: payload.email, googleId: payload.sub },
  });
  return { token: issueToken(user), user: { id: user.id, email: user.email } };
}

// Verifies a Google ID token and returns its verified email (used to re-confirm a parent in the kids section).
export async function verifyGoogleEmail(idToken: string): Promise<string | null> {
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
    const payload = ticket.getPayload();
    return payload?.email && payload.email_verified ? payload.email : null;
  } catch {
    return null;
  }
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, email: user.email };
}
