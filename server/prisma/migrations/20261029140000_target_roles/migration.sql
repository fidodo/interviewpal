-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "focusSkill" TEXT,
ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "skillTags" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "TargetRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "jobDescription" TEXT,
    "cvSummary" TEXT,
    "isTechnical" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSkill" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "importance" INTEGER NOT NULL DEFAULT 2,
    "selfRating" INTEGER,
    "rating" DOUBLE PRECISION,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRatingEvent" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillRatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "skillId" TEXT,
    "text" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleSkill_roleId_name_key" ON "RoleSkill"("roleId", "name");

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TargetRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetRole" ADD CONSTRAINT "TargetRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSkill" ADD CONSTRAINT "RoleSkill_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TargetRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRatingEvent" ADD CONSTRAINT "SkillRatingEvent_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "RoleSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TargetRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "RoleSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

