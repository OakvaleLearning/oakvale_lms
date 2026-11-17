-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Recover the past admin activity that the data already attributes to someone
-- (nothing was logged before this). Marked {"recovered": true}; IP unknown.

-- Support replies.
INSERT INTO "AuditLog" ("id", "actorId", "actorName", "actorEmail", "action", "summary", "targetType", "targetId", "details", "createdAt")
SELECT 'rec' || replace(gen_random_uuid()::text, '-', ''), a."id", a."name", a."email", 'support.reply',
       'Replied to ' || l."name" || ' in support', 'user', l."id", '{"recovered": true}'::jsonb, m."createdAt"
FROM "SupportMessage" m
JOIN "User" a ON a."id" = m."senderId"
JOIN "SupportConversation" c ON c."id" = m."conversationId"
JOIN "User" l ON l."id" = c."userId"
WHERE m."fromSupport" = true;

-- Community events created.
INSERT INTO "AuditLog" ("id", "actorId", "actorName", "actorEmail", "action", "summary", "targetType", "targetId", "details", "createdAt")
SELECT 'rec' || replace(gen_random_uuid()::text, '-', ''), a."id", a."name", a."email", 'event.create',
       'Created event “' || e."title" || '” in ' || g."name", 'event', e."id", '{"recovered": true}'::jsonb, e."createdAt"
FROM "CommunityEvent" e
JOIN "User" a ON a."id" = e."createdById"
JOIN "CommunityGroup" g ON g."id" = e."groupId";

-- Announcements posted.
INSERT INTO "AuditLog" ("id", "actorId", "actorName", "actorEmail", "action", "summary", "targetType", "targetId", "details", "createdAt")
SELECT 'rec' || replace(gen_random_uuid()::text, '-', ''), a."id", a."name", a."email", 'post.announce',
       'Posted an announcement in ' || g."name", 'post', p."id", '{"recovered": true}'::jsonb, p."createdAt"
FROM "Post" p
JOIN "User" a ON a."id" = p."authorId"
JOIN "CommunityGroup" g ON g."id" = p."groupId"
WHERE p."announcement" = true;
