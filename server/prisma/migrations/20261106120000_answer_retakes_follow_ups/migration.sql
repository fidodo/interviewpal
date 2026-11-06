-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "followUpOf" TEXT;

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "retakeGradingAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AnswerRetake" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "transcript" TEXT NOT NULL,
    "fillerStats" TEXT,
    "testResults" TEXT,
    "score" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerRetake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnswerRetake_answerId_number_key" ON "AnswerRetake"("answerId", "number");

-- AddForeignKey
ALTER TABLE "AnswerRetake" ADD CONSTRAINT "AnswerRetake_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

