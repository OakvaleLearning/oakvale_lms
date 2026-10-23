-- CreateTable
CREATE TABLE "GroupRemoval" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupRemoval_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateIndex
CREATE INDEX "GroupRemoval_userId_idx" ON "GroupRemoval"("userId");

-- AddForeignKey
ALTER TABLE "GroupRemoval" ADD CONSTRAINT "GroupRemoval_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRemoval" ADD CONSTRAINT "GroupRemoval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
