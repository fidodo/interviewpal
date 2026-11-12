import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import { verifyGoogleEmail } from "../services/auth.service";

// The parent's kid-mode PIN: needed to leave kid mode. A forgotten one is reset with real proof of the account.

// How a forgotten PIN can be reset: with the account password, or by signing in with Google again
// for Google-only accounts (which have no password).
export async function getPinInfo(parentId: string) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true, passwordHash: true } });
  return { hasPin: !!user?.kidsPinHash, resetMethod: user?.passwordHash ? ("password" as const) : ("google" as const) };
}

// Changing an existing PIN needs the current one; a forgotten PIN goes through resetPin instead.
export async function setPin(parentId: string, pin: string, currentPin: string | undefined) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true } });
  if (!user) return false;
  if (user.kidsPinHash && (!currentPin || !(await bcrypt.compare(currentPin, user.kidsPinHash)))) return false;
  await prisma.user.update({ where: { id: parentId }, data: { kidsPinHash: await bcrypt.hash(pin, 10) } });
  return true;
}

export async function resetPin(parentId: string, pin: string, proof: { password?: string; credential?: string }) {
  const user = await prisma.user.findUnique({ where: { id: parentId } });
  if (!user) return false;
  let proven = false;
  if (proof.password && user.passwordHash) {
    proven = await bcrypt.compare(proof.password, user.passwordHash);
  } else if (proof.credential) {
    proven = (await verifyGoogleEmail(proof.credential)) === user.email;
  }
  if (!proven) return false;
  await prisma.user.update({ where: { id: parentId }, data: { kidsPinHash: await bcrypt.hash(pin, 10) } });
  return true;
}

export async function verifyPin(parentId: string, pin: string) {
  const user = await prisma.user.findUnique({ where: { id: parentId }, select: { kidsPinHash: true } });
  if (!user?.kidsPinHash) return true;
  return bcrypt.compare(pin, user.kidsPinHash);
}
