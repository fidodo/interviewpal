import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

const googleClient = new OAuth2Client(env.googleClientId);

function issueToken(user: { id: string; email: string }) {
  return jwt.sign({ userId: user.id, email: user.email }, env.jwtSecret, { expiresIn: "7d" });
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

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, email: user.email };
}
