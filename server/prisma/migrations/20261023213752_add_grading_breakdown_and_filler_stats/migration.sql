-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "fillerStats" TEXT;

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "clarityScore" INTEGER,
ADD COLUMN     "correctnessScore" INTEGER,
ADD COLUMN     "depthScore" INTEGER;
