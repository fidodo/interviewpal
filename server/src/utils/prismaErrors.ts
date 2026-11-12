import { Prisma } from "@prisma/client";

// A unique constraint said no (Prisma's P2002): usually a double submit losing a race to an identical write.
export function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
