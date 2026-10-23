import "server-only";
import { prisma } from "@/lib/prisma";
import { recordProgress } from "./progress";

export interface QuizOption {
  id: string;
  text: string;
}

/** A question as learners see it — correct answers are never included. */
export interface LearnerQuestion {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE";
  prompt: string;
  options: QuizOption[];
  points: number;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  /** Only revealed once the learner has passed or has no attempts left. */
  correctOptionIds?: string[];
  explanation?: string | null;
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getQuizForLearner(lessonId: string, userId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return null;

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: quiz.id, userId },
    orderBy: { createdAt: "desc" },
    select: { score: true, passed: true, createdAt: true },
  });

  const questions: LearnerQuestion[] = quiz.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: quiz.shuffle ? shuffled(q.options as unknown as QuizOption[]) : (q.options as unknown as QuizOption[]),
    points: q.points,
  }));

  return {
    id: quiz.id,
    passMark: quiz.passMark,
    maxAttempts: quiz.maxAttempts,
    questions: quiz.shuffle ? shuffled(questions) : questions,
    attemptsUsed: attempts.length,
    bestScore: attempts.reduce<number | null>((best, a) => Math.max(best ?? 0, a.score), null),
    passed: attempts.some((a) => a.passed),
  };
}

export type SubmitQuizResult =
  | {
      ok: true;
      score: number;
      passed: boolean;
      attemptsUsed: number;
      attemptsLeft: number | null;
      results: QuestionResult[];
    }
  | { ok: false; error: string };

/** Grade a submission on the server and record the attempt. */
export async function submitQuiz(
  userId: string,
  lessonId: string,
  answers: Record<string, string[]>
): Promise<SubmitQuizResult> {
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    include: { questions: true },
  });
  if (!quiz || quiz.questions.length === 0) return { ok: false, error: "This quiz has no questions yet." };

  const used = await prisma.quizAttempt.count({ where: { quizId: quiz.id, userId } });
  if (quiz.maxAttempts !== null && used >= quiz.maxAttempts) {
    return { ok: false, error: "You have used all your attempts for this quiz." };
  }

  let earned = 0;
  let possible = 0;
  const graded = quiz.questions.map((q) => {
    const correct = [...(q.correct as string[])].sort();
    const given = [...new Set(answers[q.id] ?? [])].sort();
    const isRight = correct.length === given.length && correct.every((c, i) => c === given[i]);
    possible += q.points;
    if (isRight) earned += q.points;
    return { q, correct, isRight };
  });

  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const passed = score >= quiz.passMark;

  await prisma.quizAttempt.create({
    data: { quizId: quiz.id, userId, answers, score, passed },
  });
  const part = await prisma.lessonBlock.findFirst({ where: { lessonId, type: "QUIZ" }, select: { id: true } });
  await recordProgress(userId, lessonId, { score, completed: passed, blockId: part?.id });

  const attemptsUsed = used + 1;
  const attemptsLeft = quiz.maxAttempts === null ? null : Math.max(0, quiz.maxAttempts - attemptsUsed);
  const reveal = passed || attemptsLeft === 0;

  return {
    ok: true,
    score,
    passed,
    attemptsUsed,
    attemptsLeft,
    results: graded.map(({ q, correct, isRight }) => ({
      questionId: q.id,
      correct: isRight,
      ...(reveal ? { correctOptionIds: correct, explanation: q.explanation } : {}),
    })),
  };
}
