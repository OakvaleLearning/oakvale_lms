-- CreateEnum
CREATE TYPE "CertificateLayout" AS ENUM ('CLASSIC', 'MODERN', 'MINIMAL');

-- CreateEnum
CREATE TYPE "CertificateFont" AS ENUM ('SERIF', 'SANS');

-- CreateEnum
CREATE TYPE "CpdStatus" AS ENUM ('NONE', 'PENDING', 'SUBMITTED', 'ISSUED');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "certificatePassMark" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "certificateTemplateId" TEXT,
ADD COLUMN     "cpdEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpdHours" INTEGER,
ADD COLUMN     "cpdProvider" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "layout" "CertificateLayout" NOT NULL DEFAULT 'CLASSIC',
    "font" "CertificateFont" NOT NULL DEFAULT 'SERIF',
    "primaryColor" TEXT NOT NULL DEFAULT '#3229a2',
    "accentColor" TEXT NOT NULL DEFAULT '#b08d3c',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "heading" TEXT NOT NULL DEFAULT 'Certificate of Completion',
    "intro" TEXT NOT NULL DEFAULT 'This is to certify that',
    "body" TEXT NOT NULL DEFAULT 'has successfully completed {course}, part of the {programme} programme.',
    "footer" TEXT NOT NULL DEFAULT '',
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "signatoryTitle" TEXT NOT NULL DEFAULT '',
    "signatory2Name" TEXT NOT NULL DEFAULT '',
    "signatory2Title" TEXT NOT NULL DEFAULT '',
    "showScore" BOOLEAN NOT NULL DEFAULT true,
    "showQr" BOOLEAN NOT NULL DEFAULT true,
    "showBarcode" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "templateId" TEXT,
    "recipientName" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "programTitle" TEXT NOT NULL,
    "score" INTEGER,
    "cpdStatus" "CpdStatus" NOT NULL DEFAULT 'NONE',
    "cpdProvider" TEXT,
    "cpdHours" INTEGER,
    "cpdUpdatedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_serial_key" ON "Certificate"("serial");

-- CreateIndex
CREATE INDEX "Certificate_cpdStatus_issuedAt_idx" ON "Certificate"("cpdStatus", "issuedAt");

-- CreateIndex
CREATE INDEX "Certificate_issuedAt_idx" ON "Certificate"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_courseId_key" ON "Certificate"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_certificateTemplateId_fkey" FOREIGN KEY ("certificateTemplateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starter template, editable in Admin → Certificates.
INSERT INTO "CertificateTemplate" ("id", "name", "isDefault", "signatoryName", "signatoryTitle", "updatedAt")
VALUES ('certtpl_default', 'Oakvale classic', true, 'Oakvale Learning', 'Director of Training', CURRENT_TIMESTAMP);

-- Every course except Foundation also carries a CPD certificate.
UPDATE "Course" SET "cpdEnabled" = true WHERE "slug" <> 'foundation';
