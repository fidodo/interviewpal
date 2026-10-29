import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { AuthTokenType, consumeToken, sendPasswordResetEmail, sendVerificationEmail } from "./email.service";

const googleClient = new OAuth2Client(env.googleClientId);

interface UserRow {
  id: string;
  email: string;
  tokenVersion: number;
  emailVerified: boolean;
  passwordHash: string | null;
}

// `tv` must match User.tokenVersion; bumping the version (logout, password reset) invalidates every older token.
function issueToken(user: UserRow) {
  return jwt.sign({ userId: user.id, email: user.email, tv: user.tokenVersion }, env.jwtSecret, { expiresIn: "7d" });
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, emailVerified: user.emailVerified, hasPassword: !!user.passwordHash };
}

function session(user: UserRow) {
  return { token: issueToken(user), user: publicUser(user) };
}

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "exists" as const };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  await sendVerificationEmail(user);
  return session(user);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return session(user);
}

export async function loginWithGoogle(idToken: string) {
  const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) return null;

  const existing = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!existing) {
    const user = await prisma.user.create({ data: { email: payload.email, googleId: payload.sub, emailVerified: true } });
    return session(user);
  }

  // Google has just proven who owns this email. If the account was registered with a password but never
  // verified, that password may belong to someone who signed up with this address first, so remove it and
  // sign out any sessions they have.
  const takeoverRisk = !existing.emailVerified && !!existing.passwordHash;
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      googleId: payload.sub,
      emailVerified: true,
      ...(takeoverRisk ? { passwordHash: null, tokenVersion: { increment: 1 } } : {}),
    },
  });
  return session(user);
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
  return user ? publicUser(user) : null;
}

// Signs out every device: the shared token version moves on, so all existing cookies stop working.
export async function logoutEverywhere(userId: string) {
  await prisma.user.updateMany({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerified) return;
  await sendVerificationEmail(user);
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, AuthTokenType.VERIFY_EMAIL);
  if (!userId) return false;
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
  return true;
}

const RESET_REPLY_MS = 1500;

// Always looks the same to the caller, including how long it takes, so it can't be used to find out which
// emails have accounts.
export async function requestPasswordReset(email: string) {
  const started = Date.now();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) await sendPasswordResetEmail(user);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, RESET_REPLY_MS - (Date.now() - started))));
}

export async function resetPassword(token: string, password: string) {
  const userId = await consumeToken(token, AuthTokenType.RESET_PASSWORD);
  if (!userId) return null;
  // The link arrived in their inbox, so the email is verified too.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10), emailVerified: true, tokenVersion: { increment: 1 } },
  });
  return session(user);
}

// Password accounts confirm with their password; Google-only accounts with a fresh Google sign-in.
export async function deleteAccount(userId: string, proof: { password?: string; credential?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  const proven = user.passwordHash
    ? !!proof.password && (await bcrypt.compare(proof.password, user.passwordHash))
    : !!proof.credential && (await verifyGoogleEmail(proof.credential)) === user.email;
  if (!proven) return false;

  // Sessions have no cascade from User, so they go first. Custom topics another user's (pre-ownership) sessions
  // still point at can't be deleted, so they're detached (hidden from everyone) instead; the rest cascade.
  await prisma.$transaction([
    prisma.interviewSession.deleteMany({ where: { userId } }),
    prisma.topic.updateMany({ where: { ownerId: userId, sessions: { some: {} } }, data: { ownerId: null } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  return true;
}
