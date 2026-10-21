-- CreateEnum
CREATE TYPE "QuizKind" AS ENUM ('QUIZ', 'EXAM');

-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "textVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "kind" "QuizKind" NOT NULL DEFAULT 'QUIZ';
