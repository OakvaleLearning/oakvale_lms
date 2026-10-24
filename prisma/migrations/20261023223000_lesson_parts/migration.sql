-- Lessons become an ordered list of parts (video, audio, SCORM, web page,
-- document, text, quiz). Every existing lesson turns into a one-part lesson, so
-- nothing changes for learners: same content, same progress.

-- AlterEnum
ALTER TYPE "LessonType" ADD VALUE 'DOCUMENT';
ALTER TYPE "LessonType" ADD VALUE 'TEXT';
ALTER TYPE "LessonType" ADD VALUE 'MIXED';

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('VIDEO', 'AUDIO', 'SCORM', 'HTML', 'DOCUMENT', 'TEXT', 'QUIZ');

-- CreateTable
CREATE TABLE "LessonBlock" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "body" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockProgress" (
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "positionSec" INTEGER,
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockProgress_pkey" PRIMARY KEY ("userId","blockId")
);

-- CreateIndex
CREATE INDEX "LessonBlock_lessonId_order_idx" ON "LessonBlock"("lessonId", "order");

-- CreateIndex
CREATE INDEX "BlockProgress_blockId_idx" ON "BlockProgress"("blockId");

-- AddForeignKey
ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockProgress" ADD CONSTRAINT "BlockProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockProgress" ADD CONSTRAINT "BlockProgress_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "LessonBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one part per existing lesson, of the lesson's own type. (The part
-- keeps the lesson's duration; its title stays empty so the lesson title is
-- the only heading learners see, as before.)
INSERT INTO "LessonBlock" ("id", "lessonId", "type", "order", "durationSec", "createdAt", "updatedAt")
SELECT 'blk' || replace(gen_random_uuid()::text, '-', ''), l."id", l."type"::text::"BlockType", 0, l."durationSec", l."createdAt", CURRENT_TIMESTAMP
FROM "Lesson" l;

-- Backfill: learners' progress on each lesson becomes progress on its one part,
-- so lessons they already finished stay finished.
INSERT INTO "BlockProgress" ("userId", "blockId", "status", "positionSec", "score", "completedAt", "createdAt", "updatedAt")
SELECT p."userId", b."id", p."status", p."positionSec", p."score", p."completedAt", p."createdAt", p."updatedAt"
FROM "LessonProgress" p
JOIN "LessonBlock" b ON b."lessonId" = p."lessonId";

-- ContentAsset now belongs to a part (and still records its lesson).
ALTER TABLE "ContentAsset" ADD COLUMN "blockId" TEXT;

UPDATE "ContentAsset" a
SET "blockId" = b."id"
FROM "LessonBlock" b
WHERE b."lessonId" = a."lessonId";

ALTER TABLE "ContentAsset" ALTER COLUMN "blockId" SET NOT NULL;

-- DropIndex
DROP INDEX "ContentAsset_lessonId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_blockId_key" ON "ContentAsset"("blockId");

-- CreateIndex
CREATE INDEX "ContentAsset_lessonId_idx" ON "ContentAsset"("lessonId");

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "LessonBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
