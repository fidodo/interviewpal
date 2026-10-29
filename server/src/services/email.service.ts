import crypto from "crypto";
import { prisma } from "../db/prisma";
import { emailEnabled, env } from "../config/env";

export const AuthTokenType = {
  VERIFY_EMAIL: "VERIFY_EMAIL",
  RESET_PASSWORD: "RESET_PASSWORD",
} as const;
export type AuthTokenType = (typeof AuthTokenType)[keyof typeof AuthTokenType];

const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

// Creates a single-use link token. Any earlier unused token of the same type for this user is invalidated.
async function createToken(userId: string, type: AuthTokenType) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]) } }),
  ]);
  return token;
}

// Marks a token used and returns its user id, or null if it's unknown, expired or already used.
export async function consumeToken(token: string, type: AuthTokenType): Promise<string | null> {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const claimed = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? row.userId : null;
}

async function send(to: string, subject: string, text: string, link: string) {
  if (!emailEnabled) {
    // No email provider configured. Links are only printed in development; logging them in production would leak them.
    if (!env.isProd) console.log(`[email disabled] ${subject} for ${to}: ${link}`);
    return;
  }
  // A failed send must not fail the request (e.g. sign-up has already created the account); the user can resend.
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to, subject, text: `${text}\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.` }),
    });
    if (!res.ok) console.error(`Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error("Resend request failed:", err);
  }
}

export async function sendVerificationEmail(user: { id: string; email: string }) {
  const token = await createToken(user.id, AuthTokenType.VERIFY_EMAIL);
  await send(user.email, "Confirm your InterviewPal email", "Confirm your email address to finish setting up InterviewPal:", `${env.clientUrl}/verify-email?token=${token}`);
}

export async function sendPasswordResetEmail(user: { id: string; email: string }) {
  const token = await createToken(user.id, AuthTokenType.RESET_PASSWORD);
  await send(user.email, "Reset your InterviewPal password", "Use this link within an hour to choose a new password:", `${env.clientUrl}/reset-password?token=${token}`);
}
