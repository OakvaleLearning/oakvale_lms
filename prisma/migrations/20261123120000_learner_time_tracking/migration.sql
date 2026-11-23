-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN "timeSpentSec" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN "durationSec" INTEGER;

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_createdAt_idx" ON "QuizAttempt"("userId", "createdAt");
