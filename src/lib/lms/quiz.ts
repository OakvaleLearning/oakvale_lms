import "server-only";
import { prisma } from "@/lib/prisma";
import { blankMatches, blankSegments, displayBlankPrompt } from "./fill-blank";
import { recordProgress } from "./progress";

export interface QuizOption {
  id: string;
  text: string;
}

/** A question as learners see it — correct answers are never included. */
export interface LearnerQuestion {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "FILL_BLANK";
  /** For FILL_BLANK, the sentence with each blank shown as "_____". */
  prompt: string;
  /** Empty for FILL_BLANK. */
  options: QuizOption[];
  /** FILL_BLANK only: the text around the blanks; there are `segments.length - 1` blanks. Answer with one string per blank, in order. */
  segments?: string[];
  points: number;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  /** FILL_BLANK only: which blanks were right, in order. */
  blanks?: boolean[];
  /** Only revealed once the learner has passed or has no attempts left. */
  correctOptionIds?: string[];
  /** FILL_BLANK, revealed like correctOptionIds: the accepted answers for each blank, in order. */
  correctAnswers?: string[][];
  explanation?: string | null;
}

export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The fields of a stored question that marking and the learner view need (Question and BankQuestion both fit). */
export interface StoredQuestion {
  id: string;
  type: LearnerQuestion["type"];
  prompt: string;
  options: unknown;
  correct: unknown;
  explanation: string | null;
  points: number;
}

/** A stored question as learners see it, with the answers stripped. */
export function toLearnerQuestion(q: StoredQuestion, shuffleOptions = false): LearnerQuestion {
  if (q.type === "FILL_BLANK") {
    return {
      id: q.id,
      type: q.type,
      prompt: displayBlankPrompt(q.prompt),
      options: [],
      segments: blankSegments(q.prompt),
      points: q.points,
    };
  }
  const options = q.options as QuizOption[];
  return { id: q.id, type: q.type, prompt: q.prompt, options: shuffleOptions ? shuffled(options) : options, points: q.points };
}

/** Mark answers against stored questions. The score is the share of points earned, as a whole percent. */
export function gradeAnswers<Q extends StoredQuestion>(questions: Q[], answers: Record<string, string[]>) {
  let earned = 0;
  let possible = 0;
  const graded = questions.map((q) => {
    possible += q.points;
    if (q.type === "FILL_BLANK") {
      // One mark per blank: a question with three blanks and two right earns two thirds of its points.
      const correct = q.correct as string[];
      const blanks = correct.map((accepted, i) => blankMatches(answers[q.id]?.[i], accepted));
      const right = blanks.filter(Boolean).length;
      earned += correct.length ? (q.points * right) / correct.length : 0;
      return { q, correct, blanks, isRight: right === correct.length };
    }
    const correct = [...(q.correct as string[])].sort();
    const given = [...new Set(answers[q.id] ?? [])].sort();
    const isRight = correct.length === given.length && correct.every((c, i) => c === given[i]);
    if (isRight) earned += q.points;
    return { q, correct, blanks: undefined as boolean[] | undefined, isRight };
  });
  return { score: possible ? Math.round((earned / possible) * 100) : 0, graded };
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

  const questions = quiz.questions.map((q) => toLearnerQuestion(q, quiz.shuffle));

  return {
    id: quiz.id,
    passMark: quiz.passMark,
    maxAttempts: quiz.maxAttempts,
    secondsPerQuestion: quiz.secondsPerQuestion,
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
  answers: Record<string, string[]>,
  durationSec?: number
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

  const { score, graded } = gradeAnswers(quiz.questions, answers);
  const passed = score >= quiz.passMark;

  await prisma.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId,
      answers,
      score,
      passed,
      // Client-measured; capped at a day so a tab left open for weeks doesn't skew reports.
      durationSec: durationSec === undefined ? null : Math.min(86_400, Math.round(durationSec)),
    },
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
    results: graded.map(({ q, correct, blanks, isRight }) => ({
      questionId: q.id,
      correct: isRight,
      ...(blanks ? { blanks } : {}),
      ...(reveal
        ? blanks
          ? { correctAnswers: correct.map((c) => c.split("|")), explanation: q.explanation }
          : { correctOptionIds: correct, explanation: q.explanation }
        : {}),
    })),
  };
}
