-- CreateTable
CREATE TABLE "DesignChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "hints" TEXT NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "keyPoints" TEXT NOT NULL,
    "referenceDesign" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "diagram" TEXT,
    "notes" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "DesignChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignChallenge_userId_createdAt_idx" ON "DesignChallenge"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DesignChallenge" ADD CONSTRAINT "DesignChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

