-- Certificates are issued per programme instead of per module.
-- Settings move from Module to Program (copied from the programme's modules),
-- and certificates gain programId + scope. Certificates already issued per
-- module are kept, and stay valid.

-- 1. Programme certificate settings
ALTER TABLE "Program" ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "certificatePassMark" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "certificateTemplateId" TEXT,
ADD COLUMN     "cpdEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpdHours" INTEGER,
ADD COLUMN     "cpdProvider" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Program" ADD CONSTRAINT "Program_certificateTemplateId_fkey" FOREIGN KEY ("certificateTemplateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy from the modules: on if any module had it on; pass mark and template
-- from the first module (by order); CPD on if any module had it, with the
-- first issuing body named and the modules' CPD hours added together.
UPDATE "Program" p SET
  "certificateEnabled" = s.enabled,
  "certificatePassMark" = s.pass_mark,
  "certificateTemplateId" = s.template_id,
  "cpdEnabled" = s.cpd_enabled,
  "cpdProvider" = COALESCE(s.cpd_provider, ''),
  "cpdHours" = s.cpd_hours
FROM (
  SELECT
    m."programId",
    bool_or(m."certificateEnabled") AS enabled,
    (array_agg(m."certificatePassMark" ORDER BY m."order", m."createdAt"))[1] AS pass_mark,
    (array_agg(m."certificateTemplateId" ORDER BY m."order", m."createdAt") FILTER (WHERE m."certificateTemplateId" IS NOT NULL))[1] AS template_id,
    bool_or(m."cpdEnabled") AS cpd_enabled,
    (array_agg(m."cpdProvider" ORDER BY m."order", m."createdAt") FILTER (WHERE m."cpdEnabled" AND m."cpdProvider" <> ''))[1] AS cpd_provider,
    NULLIF(SUM(m."cpdHours") FILTER (WHERE m."cpdEnabled"), 0)::INTEGER AS cpd_hours
  FROM "Module" m
  GROUP BY m."programId"
) s
WHERE s."programId" = p."id";

-- 2. Drop the module settings
ALTER TABLE "Module" DROP CONSTRAINT "Module_certificateTemplateId_fkey";

ALTER TABLE "Module" DROP COLUMN "certificateEnabled",
DROP COLUMN "certificatePassMark",
DROP COLUMN "certificateTemplateId",
DROP COLUMN "cpdEnabled",
DROP COLUMN "cpdHours",
DROP COLUMN "cpdProvider";

-- 3. Certificates belong to a programme
ALTER TABLE "Certificate" ADD COLUMN     "programId" TEXT,
ADD COLUMN     "scope" TEXT;

ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Certificate_programId_idx" ON "Certificate"("programId");

CREATE UNIQUE INDEX "Certificate_userId_programId_scope_key" ON "Certificate"("userId", "programId", "scope");

-- Old module certificates point at their module's programme too (scope stays
-- NULL, which marks them as module certificates).
UPDATE "Certificate" c SET "programId" = m."programId"
FROM "Module" m
WHERE c."moduleId" = m."id" AND c."programId" IS NULL;

-- 4. New templates describe the programme ("{module}" is now the modules covered).
ALTER TABLE "CertificateTemplate" ALTER COLUMN "body" SET DEFAULT 'has successfully completed the {programme} programme, covering {module}.';
