-- CreateTable
CREATE TABLE "StoryPractice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "topic" TEXT,
    "audience" TEXT,
    "targetSeconds" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "coachingNotes" TEXT NOT NULL,
    "gradingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryPractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryTake" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "transcript" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "stats" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryTake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryPractice_userId_createdAt_idx" ON "StoryPractice"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryTake_storyId_number_key" ON "StoryTake"("storyId", "number");

-- AddForeignKey
ALTER TABLE "StoryPractice" ADD CONSTRAINT "StoryPractice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTake" ADD CONSTRAINT "StoryTake_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPractice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

