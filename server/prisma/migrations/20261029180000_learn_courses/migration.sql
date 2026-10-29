-- CreateTable
CREATE TABLE "LearnCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "content" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearnLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnQuestion" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT NOT NULL DEFAULT '[]',
    "answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "LearnQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "feedback" TEXT NOT NULL DEFAULT '',
    "fromReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnLesson_courseId_order_key" ON "LearnLesson"("courseId", "order");

-- CreateIndex
CREATE INDEX "ReviewItem_userId_dueAt_idx" ON "ReviewItem"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_questionId_key" ON "ReviewItem"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "LearnCourse" ADD CONSTRAINT "LearnCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnCourse" ADD CONSTRAINT "LearnCourse_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "RoleSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLesson" ADD CONSTRAINT "LearnLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LearnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnQuestion" ADD CONSTRAINT "LearnQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LearnLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnAnswer" ADD CONSTRAINT "LearnAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "LearnQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "LearnQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

