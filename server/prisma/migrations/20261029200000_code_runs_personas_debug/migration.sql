-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "persona" TEXT NOT NULL DEFAULT 'NEUTRAL';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "codeSpec" TEXT;

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "testResults" TEXT;

-- CreateTable
CREATE TABLE "DebugChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "buggyCode" TEXT NOT NULL,
    "spec" TEXT,
    "bugs" TEXT NOT NULL,
    "referenceFix" TEXT NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "submittedCode" TEXT,
    "explanation" TEXT,
    "testResults" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "DebugChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebugChallenge_userId_createdAt_idx" ON "DebugChallenge"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DebugChallenge" ADD CONSTRAINT "DebugChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

