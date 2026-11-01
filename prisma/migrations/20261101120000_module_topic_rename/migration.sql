-- Programme → Module → Topic → Lesson.
-- Renames in place (no data moves): the old Module becomes Topic, then the
-- old Course becomes Module. Order matters because "Module" is reused.

-- 1. Module → Topic (and Lesson.moduleId → topicId)
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_moduleId_fkey";
ALTER TABLE "Module" DROP CONSTRAINT "Module_courseId_fkey";

ALTER TABLE "Module" RENAME TO "Topic";
ALTER TABLE "Topic" RENAME CONSTRAINT "Module_pkey" TO "Topic_pkey";
ALTER TABLE "Topic" RENAME COLUMN "courseId" TO "moduleId";
ALTER INDEX "Module_courseId_order_idx" RENAME TO "Topic_moduleId_order_idx";

ALTER TABLE "Lesson" RENAME COLUMN "moduleId" TO "topicId";
ALTER INDEX "Lesson_moduleId_order_idx" RENAME TO "Lesson_topicId_order_idx";
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Course → Module
ALTER TABLE "Course" RENAME TO "Module";
ALTER TABLE "Module" RENAME CONSTRAINT "Course_pkey" TO "Module_pkey";
ALTER TABLE "Module" RENAME CONSTRAINT "Course_programId_fkey" TO "Module_programId_fkey";
ALTER TABLE "Module" RENAME CONSTRAINT "Course_prerequisiteId_fkey" TO "Module_prerequisiteId_fkey";
ALTER TABLE "Module" RENAME CONSTRAINT "Course_certificateTemplateId_fkey" TO "Module_certificateTemplateId_fkey";
ALTER INDEX "Course_programId_order_idx" RENAME TO "Module_programId_order_idx";
ALTER INDEX "Course_programId_slug_key" RENAME TO "Module_programId_slug_key";

ALTER TABLE "Topic" ADD CONSTRAINT "Topic_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. TierCourse → TierModule
ALTER TABLE "TierCourse" RENAME TO "TierModule";
ALTER TABLE "TierModule" RENAME COLUMN "courseId" TO "moduleId";
ALTER TABLE "TierModule" RENAME CONSTRAINT "TierCourse_pkey" TO "TierModule_pkey";
ALTER TABLE "TierModule" RENAME CONSTRAINT "TierCourse_tierId_fkey" TO "TierModule_tierId_fkey";
ALTER TABLE "TierModule" RENAME CONSTRAINT "TierCourse_courseId_fkey" TO "TierModule_moduleId_fkey";
ALTER INDEX "TierCourse_courseId_idx" RENAME TO "TierModule_moduleId_idx";

-- 4. Certificate.courseId / courseTitle → moduleId / moduleTitle
ALTER TABLE "Certificate" RENAME COLUMN "courseId" TO "moduleId";
ALTER TABLE "Certificate" RENAME COLUMN "courseTitle" TO "moduleTitle";
ALTER TABLE "Certificate" RENAME CONSTRAINT "Certificate_courseId_fkey" TO "Certificate_moduleId_fkey";
ALTER INDEX "Certificate_userId_courseId_key" RENAME TO "Certificate_userId_moduleId_key";

-- 5. Certificate wording: {course} → {module} ({course} still works as an alias)
ALTER TABLE "CertificateTemplate" ALTER COLUMN "body" SET DEFAULT 'has successfully completed {module}, part of the {programme} programme.';
UPDATE "CertificateTemplate" SET "body" = replace("body", '{course}', '{module}') WHERE "body" LIKE '%{course}%';

-- 6. Seeded topic titles ("Module 1: …") now read "Topic 1: …". Other titles are left alone.
UPDATE "Topic" SET "title" = regexp_replace("title", '^Module (\d+):', 'Topic \1:') WHERE "title" ~ '^Module \d+:';
