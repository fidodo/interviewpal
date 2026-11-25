-- CreateTable
CREATE TABLE "PoolSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "company" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "poolItemId" TEXT,

    CONSTRAINT "PoolSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoolSubmission_status_createdAt_idx" ON "PoolSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PoolSubmission_userId_createdAt_idx" ON "PoolSubmission"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PoolSubmission" ADD CONSTRAINT "PoolSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSubmission" ADD CONSTRAINT "PoolSubmission_poolItemId_fkey" FOREIGN KEY ("poolItemId") REFERENCES "PoolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

