-- AlterTable
ALTER TABLE "PreAssessment" ADD COLUMN     "secondsPerQuestion" INTEGER;

-- AlterTable
ALTER TABLE "PreAssessmentAttempt" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "questionStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "secondsPerQuestion" INTEGER;


-- Attempts already open keep going from their first question.
UPDATE "PreAssessmentAttempt" SET "questionStartedAt" = "startedAt" WHERE "submittedAt" IS NULL;
