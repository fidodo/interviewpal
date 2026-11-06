-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderSentOn" DATE;

-- CreateTable
CREATE TABLE "PracticeDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kinds" TEXT[],

    CONSTRAINT "PracticeDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "PersonalBest" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalBest_pkey" PRIMARY KEY ("userId","kind")
);

-- AddForeignKey
ALTER TABLE "PracticeDay" ADD CONSTRAINT "PracticeDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalBest" ADD CONSTRAINT "PersonalBest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: practice days from what's already stored (timestamps are UTC), so existing streaks carry over.
INSERT INTO "PracticeDay" ("userId", "day", "kinds")
SELECT "userId", "day", array_agg(DISTINCT "kind")
FROM (
  SELECT s."userId", a."submittedAt"::date AS "day", 'ANSWER' AS "kind"
    FROM "Answer" a JOIN "Question" q ON q."id" = a."questionId" JOIN "InterviewSession" s ON s."id" = q."sessionId"
  UNION ALL
  SELECT s."userId", r."createdAt"::date, 'RETAKE'
    FROM "AnswerRetake" r JOIN "Answer" a ON a."id" = r."answerId" JOIN "Question" q ON q."id" = a."questionId" JOIN "InterviewSession" s ON s."id" = q."sessionId"
  UNION ALL
  SELECT p."userId", t."createdAt"::date, 'SPEAK' FROM "StoryTake" t JOIN "StoryPractice" p ON p."id" = t."storyId"
  UNION ALL
  SELECT "userId", "submittedAt"::date, 'DEBUG' FROM "DebugChallenge" WHERE "score" IS NOT NULL AND "submittedAt" IS NOT NULL
  UNION ALL
  SELECT "userId", "submittedAt"::date, 'DESIGN' FROM "DesignChallenge" WHERE "score" IS NOT NULL AND "submittedAt" IS NOT NULL
  UNION ALL
  SELECT "userId", "reviewedAt"::date, 'TERMS' FROM "TermProgress" WHERE "reviewedAt" IS NOT NULL
) AS x
GROUP BY "userId", "day";

-- Backfill: personal bests, so the first "New personal best!" really beats everything before it.
INSERT INTO "PersonalBest" ("userId", "kind", "score")
SELECT "userId", "kind", MAX("score")
FROM (
  SELECT s."userId", 'ANSWER' AS "kind", f."score"
    FROM "Feedback" f JOIN "Answer" a ON a."id" = f."answerId" JOIN "Question" q ON q."id" = a."questionId" JOIN "InterviewSession" s ON s."id" = q."sessionId"
  UNION ALL
  SELECT s."userId", 'ANSWER', r."score"
    FROM "AnswerRetake" r JOIN "Answer" a ON a."id" = r."answerId" JOIN "Question" q ON q."id" = a."questionId" JOIN "InterviewSession" s ON s."id" = q."sessionId"
  UNION ALL
  SELECT p."userId", 'SPEAK', t."score" FROM "StoryTake" t JOIN "StoryPractice" p ON p."id" = t."storyId"
  UNION ALL
  SELECT "userId", 'DEBUG', "score" FROM "DebugChallenge" WHERE "score" IS NOT NULL
  UNION ALL
  SELECT "userId", 'DESIGN', "score" FROM "DesignChallenge" WHERE "score" IS NOT NULL
) AS x
GROUP BY "userId", "kind";

-- Backfill: "First 9/10" for anyone who already has one.
INSERT INTO "Achievement" ("userId", "key")
SELECT DISTINCT "userId", 'first-nine' FROM "PersonalBest" WHERE "score" >= 9;
