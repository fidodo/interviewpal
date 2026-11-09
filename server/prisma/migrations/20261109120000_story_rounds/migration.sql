-- AlterTable
ALTER TABLE "StoryPractice" ADD COLUMN     "continuesFromId" TEXT,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "StoryPractice_continuesFromId_key" ON "StoryPractice"("continuesFromId");

-- AddForeignKey
ALTER TABLE "StoryPractice" ADD CONSTRAINT "StoryPractice_continuesFromId_fkey" FOREIGN KEY ("continuesFromId") REFERENCES "StoryPractice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

