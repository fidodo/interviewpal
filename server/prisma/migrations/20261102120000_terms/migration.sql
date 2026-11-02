-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "presetKey" TEXT,
    "deck" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "confusedWith" TEXT,
    "interviewQuestion" TEXT NOT NULL,
    "distractors" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "introducedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Term_presetKey_key" ON "Term"("presetKey");

-- CreateIndex
CREATE INDEX "Term_userId_deck_idx" ON "Term"("userId", "deck");

-- CreateIndex
CREATE INDEX "TermProgress_userId_dueAt_idx" ON "TermProgress"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TermProgress_userId_termId_key" ON "TermProgress"("userId", "termId");

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermProgress" ADD CONSTRAINT "TermProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermProgress" ADD CONSTRAINT "TermProgress_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

