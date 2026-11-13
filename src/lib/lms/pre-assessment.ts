import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gradeAnswers, shuffled, toLearnerQuestion, type LearnerQuestion } from "./quiz";

/**
 * Tier pre-assessments: an entry test a learner must pass before checkout
 * opens for that tier. Questions are drawn at random, spread evenly across the
 * question banks the assessment uses, once per attempt, and stored on the attempt.
 *
 * An assessment only gates enrolment while it is enabled and its banks hold
 * at least one question, so a half-built one never blocks sales.
 * Admin-granted enrolments skip it.
 */

/** Pre-assessments that currently gate enrolment. */
export const activeAssessmentWhere = {
  enabled: true,
  banks: { some: { questions: { some: {} } } },
} satisfies Prisma.PreAssessmentWhereInput;

const HOUR = 60 * 60 * 1000;

/**
 * For each of the given tiers that has an active pre-assessment: whether this
 * learner has passed it. Tiers without one are absent from the map.
 */
export async function getEnrolmentGates(userId: string | null, tierIds: string[]) {
  const rows = await prisma.preAssessment.findMany({
    where: { tierId: { in: tierIds }, ...activeAssessmentWhere },
    select: {
      tierId: true,
      attempts: { where: { userId: userId ?? "", passed: true }, select: { id: true }, take: 1 },
    },
  });
  return new Map(rows.map((r) => [r.tierId, { passed: r.attempts.length > 0 }]));
}

/** True when the learner must still pass this tier's pre-assessment before paying. */
export async function needsPreAssessment(userId: string, tierId: string) {
  const gate = (await getEnrolmentGates(userId, [tierId])).get(tierId);
  return Boolean(gate && !gate.passed);
}

/** The question ids in each of the assessment's banks. */
async function bankQuestionIds(assessmentId: string) {
  const banks = await prisma.questionBank.findMany({
    where: { assessments: { some: { id: assessmentId } } },
    select: { questions: { select: { id: true } } },
  });
  return banks.map((b) => b.questions.map((q) => q.id));
}

/** Every question in the assessment's banks, without duplicates. */
async function questionPool(assessmentId: string) {
  return [...new Set((await bankQuestionIds(assessmentId)).flat())];
}

/**
 * Draw `count` questions spread evenly across the banks, so no bank (e.g. one
 * topic) is left out: 40 from 10 banks is 4 from each. Leftover places go to
 * random banks, and a bank too small for its share is topped up from the others.
 */
export function drawEvenly(banks: string[][], count: number): string[] {
  const pools = shuffled(banks.filter((b) => b.length > 0).map((b) => shuffled(b)));
  const picked = new Set<string>();
  // Round-robin: one from each bank in turn until enough are drawn or every bank is used up.
  while (picked.size < count && pools.some((p) => p.length > 0)) {
    for (const pool of pools) {
      if (picked.size >= count) break;
      let id = pool.pop();
      while (id && picked.has(id)) id = pool.pop(); // a question in two banks counts once
      if (id) picked.add(id);
    }
  }
  return shuffled([...picked]);
}

export type PreAssessmentStatus =
  | { kind: "passed"; score: number }
  | { kind: "in-progress"; attemptId: string }
  | { kind: "ready" }
  | { kind: "wait"; until: Date }
  | { kind: "no-attempts" };

/** Everything the learner page needs for one tier. Null when the tier has no active pre-assessment. */
export async function getPreAssessmentState(userId: string, tierId: string) {
  const assessment = await prisma.preAssessment.findFirst({
    where: { tierId, ...activeAssessmentWhere },
    include: {
      attempts: { where: { userId }, orderBy: { startedAt: "desc" } },
    },
  });
  if (!assessment) return null;

  const poolSize = (await questionPool(assessment.id)).length;
  const { attempts } = assessment;
  const submitted = attempts.filter((a) => a.submittedAt);
  const pass = submitted.find((a) => a.passed);
  const open = attempts.find((a) => !a.submittedAt);
  const last = submitted[0] ?? null;

  let status: PreAssessmentStatus;
  if (pass) status = { kind: "passed", score: pass.score ?? 0 };
  else if (open) status = { kind: "in-progress", attemptId: open.id };
  else if (assessment.maxAttempts !== null && attempts.length >= assessment.maxAttempts) status = { kind: "no-attempts" };
  else if (last?.submittedAt && assessment.retakeAfterHours > 0) {
    const until = new Date(last.submittedAt.getTime() + assessment.retakeAfterHours * HOUR);
    status = until > new Date() ? { kind: "wait", until } : { kind: "ready" };
  } else status = { kind: "ready" };

  return {
    id: assessment.id,
    instructions: assessment.instructions,
    passMark: assessment.passMark,
    questionCount: Math.min(assessment.questionCount, poolSize),
    maxAttempts: assessment.maxAttempts,
    retakeAfterHours: assessment.retakeAfterHours,
    attemptsUsed: attempts.length,
    lastScore: last?.score ?? null,
    status,
  };
}

/** Start an attempt (or return the one already open) with a fresh random draw of questions. */
export async function startAttempt(userId: string, tierId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getPreAssessmentState(userId, tierId);
  if (!state) return { ok: false, error: "This tier doesn't need a pre-assessment." };
  switch (state.status.kind) {
    case "in-progress": {
      // Resume it, unless every question it drew has since been deleted.
      const left = await getAttemptQuestions(userId, state.status.attemptId);
      if (left?.length) return { ok: true };
      await prisma.preAssessmentAttempt.delete({ where: { id: state.status.attemptId } });
      break;
    }
    case "passed":
      return { ok: false, error: "You've already passed this pre-assessment." };
    case "no-attempts":
      return { ok: false, error: "You've used all your attempts." };
    case "wait":
      return { ok: false, error: "You can't retake it just yet." };
  }
  const questionIds = drawEvenly(await bankQuestionIds(state.id), state.questionCount);
  if (questionIds.length === 0) return { ok: false, error: "This pre-assessment has no questions yet." };
  await prisma.preAssessmentAttempt.create({ data: { assessmentId: state.id, userId, questionIds } });
  return { ok: true };
}

/** The questions of an open attempt, in the order they were drawn, without answers. */
export async function getAttemptQuestions(userId: string, attemptId: string): Promise<LearnerQuestion[] | null> {
  const attempt = await prisma.preAssessmentAttempt.findFirst({
    where: { id: attemptId, userId, submittedAt: null },
    select: { questionIds: true },
  });
  if (!attempt) return null;
  const ids = attempt.questionIds as string[];
  const rows = await prisma.bankQuestion.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((q) => [q.id, q]));
  // A question deleted from its bank after the draw is simply left out.
  return ids.flatMap((id) => {
    const q = byId.get(id);
    return q ? [toLearnerQuestion(q, true)] : [];
  });
}

/** Mark an open attempt on the server. Answers aren't revealed, so the bank stays useful. */
export async function submitAttempt(
  userId: string,
  tierId: string,
  attemptId: string,
  answers: Record<string, string[]>
): Promise<{ ok: true; score: number; passed: boolean } | { ok: false; error: string }> {
  const attempt = await prisma.preAssessmentAttempt.findFirst({
    where: { id: attemptId, userId, submittedAt: null, assessment: { tierId } },
    select: { questionIds: true, assessment: { select: { passMark: true } } },
  });
  if (!attempt) return { ok: false, error: "This attempt has already been submitted." };

  const ids = attempt.questionIds as string[];
  const questions = await prisma.bankQuestion.findMany({ where: { id: { in: ids } } });
  if (questions.length === 0) return { ok: false, error: "These questions are no longer available. Please start again." };

  const { score } = gradeAnswers(questions, answers);
  const passed = score >= attempt.assessment.passMark;
  // Guarded on submittedAt so a double submit can't overwrite the first result.
  const saved = await prisma.preAssessmentAttempt.updateMany({
    where: { id: attemptId, submittedAt: null },
    data: { answers, score, passed, submittedAt: new Date() },
  });
  if (saved.count === 0) return { ok: false, error: "This attempt has already been submitted." };
  return { ok: true, score, passed };
}
