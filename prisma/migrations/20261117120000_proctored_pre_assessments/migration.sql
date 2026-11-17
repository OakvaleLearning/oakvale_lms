-- CreateEnum
CREATE TYPE "PreAssessmentEnd" AS ENUM ('SUBMITTED', 'TIMED_OUT', 'TERMINATED');

-- AlterTable
ALTER TABLE "PreAssessment" ADD COLUMN     "maxStrikes" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "proctored" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timeLimitMinutes" INTEGER DEFAULT 60,
ADD COLUMN     "webcam" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PreAssessmentAttempt" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "endReason" "PreAssessmentEnd",
ADD COLUMN     "events" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "resetAt" TIMESTAMP(3),
ADD COLUMN     "strikes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "preAssessmentWaived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PreAssessmentSnapshot" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreAssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreAssessmentSnapshot_attemptId_takenAt_idx" ON "PreAssessmentSnapshot"("attemptId", "takenAt");

-- AddForeignKey
ALTER TABLE "PreAssessmentSnapshot" ADD CONSTRAINT "PreAssessmentSnapshot_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PreAssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Pre-assessments now gate access to a tier's modules, not just checkout.
-- Learners already enrolled keep their access.
UPDATE "Enrollment" SET "preAssessmentWaived" = true WHERE "status" = 'ACTIVE';

-- Earlier attempts weren't proctored: mark how they ended.
UPDATE "PreAssessmentAttempt" SET "endReason" = 'SUBMITTED' WHERE "submittedAt" IS NOT NULL;
