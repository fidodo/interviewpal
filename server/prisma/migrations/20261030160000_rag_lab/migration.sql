-- CreateTable
CREATE TABLE "RagProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagAttempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "caseIds" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "code" TEXT NOT NULL,
    "outputs" TEXT,
    "results" TEXT,
    "metrics" TEXT,
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "RagAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingCache" (
    "hash" TEXT NOT NULL,
    "vector" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingCache_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "RagProject_userId_createdAt_idx" ON "RagProject"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RagAttempt_projectId_createdAt_idx" ON "RagAttempt"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "RagProject" ADD CONSTRAINT "RagProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagAttempt" ADD CONSTRAINT "RagAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RagProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

