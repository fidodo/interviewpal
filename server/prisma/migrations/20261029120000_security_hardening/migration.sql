-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Google sign-ins have already proven they own the email.
UPDATE "User" SET "emailVerified" = true WHERE "googleId" IS NOT NULL;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "ownerId" TEXT;

-- Custom topics used to be global. Give each one to the user whose earliest session used it.
-- Custom topics no session ever used have no known owner; they are assigned to the admin account by a
-- one-off step after seeding, not deleted.
UPDATE "Topic" t SET "ownerId" = first_use."userId"
FROM (
  SELECT DISTINCT ON ("topicId") "topicId", "userId"
  FROM "InterviewSession"
  ORDER BY "topicId", "startedAt"
) first_use
WHERE t."isCustom" = true AND first_use."topicId" = t."id";

-- DropIndex
DROP INDEX "Topic_name_track_key";

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_name_track_ownerId_key" ON "Topic"("name", "track", "ownerId");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
