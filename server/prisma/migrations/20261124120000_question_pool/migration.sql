-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "poolItemId" TEXT;

-- AlterTable
ALTER TABLE "DebugChallenge" ADD COLUMN     "poolItemId" TEXT;

-- AlterTable
ALTER TABLE "DesignChallenge" ADD COLUMN     "poolItemId" TEXT;

-- CreateTable
CREATE TABLE "PoolItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "track" TEXT,
    "topic" TEXT,
    "language" TEXT,
    "level" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "licence" TEXT,
    "credit" TEXT,
    "checksum" TEXT NOT NULL,
    "served" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "PoolItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolVote" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "realistic" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolVote_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "PoolSource" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "licence" TEXT NOT NULL,
    "lastCommit" TEXT,
    "checkedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "PoolSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolUpdate" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "retired" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "PoolUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoolItem_checksum_key" ON "PoolItem"("checksum");

-- CreateIndex
CREATE INDEX "PoolItem_kind_level_retiredAt_idx" ON "PoolItem"("kind", "level", "retiredAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_poolItemId_fkey" FOREIGN KEY ("poolItemId") REFERENCES "PoolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebugChallenge" ADD CONSTRAINT "DebugChallenge_poolItemId_fkey" FOREIGN KEY ("poolItemId") REFERENCES "PoolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignChallenge" ADD CONSTRAINT "DesignChallenge_poolItemId_fkey" FOREIGN KEY ("poolItemId") REFERENCES "PoolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolVote" ADD CONSTRAINT "PoolVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolVote" ADD CONSTRAINT "PoolVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PoolItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

