-- AlterTable
ALTER TABLE "SessionSummary" ADD COLUMN     "storyNotes" TEXT;

-- CreateTable
CREATE TABLE "StoryBankEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "bestScore" INTEGER,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryBankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryBankEntry_storyId_key" ON "StoryBankEntry"("storyId");

-- CreateIndex
CREATE INDEX "StoryBankEntry_userId_idx" ON "StoryBankEntry"("userId");

-- AddForeignKey
ALTER TABLE "StoryBankEntry" ADD CONSTRAINT "StoryBankEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBankEntry" ADD CONSTRAINT "StoryBankEntry_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPractice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

