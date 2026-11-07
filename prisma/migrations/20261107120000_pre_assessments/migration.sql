-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestion" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct" JSONB NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAssessment" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT NOT NULL DEFAULT '',
    "questionCount" INTEGER NOT NULL DEFAULT 20,
    "passMark" INTEGER NOT NULL DEFAULT 70,
    "maxAttempts" INTEGER,
    "retakeAfterHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionIds" JSONB NOT NULL,
    "answers" JSONB,
    "score" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "PreAssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PreAssessmentToQuestionBank" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PreAssessmentToQuestionBank_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "BankQuestion_bankId_order_idx" ON "BankQuestion"("bankId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PreAssessment_tierId_key" ON "PreAssessment"("tierId");

-- CreateIndex
CREATE INDEX "PreAssessmentAttempt_assessmentId_userId_idx" ON "PreAssessmentAttempt"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "PreAssessmentAttempt_userId_idx" ON "PreAssessmentAttempt"("userId");

-- CreateIndex
CREATE INDEX "_PreAssessmentToQuestionBank_B_index" ON "_PreAssessmentToQuestionBank"("B");

-- AddForeignKey
ALTER TABLE "BankQuestion" ADD CONSTRAINT "BankQuestion_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAssessment" ADD CONSTRAINT "PreAssessment_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAssessmentAttempt" ADD CONSTRAINT "PreAssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "PreAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAssessmentAttempt" ADD CONSTRAINT "PreAssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreAssessmentToQuestionBank" ADD CONSTRAINT "_PreAssessmentToQuestionBank_A_fkey" FOREIGN KEY ("A") REFERENCES "PreAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreAssessmentToQuestionBank" ADD CONSTRAINT "_PreAssessmentToQuestionBank_B_fkey" FOREIGN KEY ("B") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

