-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_answerId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionSummary" DROP CONSTRAINT "SessionSummary_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
