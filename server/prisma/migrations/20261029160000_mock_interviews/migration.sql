-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'PRACTICE';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "round" TEXT;

-- AlterTable
ALTER TABLE "SessionSummary" ADD COLUMN     "roundScores" TEXT,
ADD COLUMN     "verdict" TEXT;

