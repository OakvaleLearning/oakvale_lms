import "server-only";
import type { PreAssessmentEnd, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isStorageConfigured, putObject } from "@/lib/storage";
import { gradeAnswers, shuffled, toLearnerQuestion, type LearnerQuestion } from "./quiz";
import { PROCTOR_EVENTS, SNAPSHOT_MAX_BYTES, type ClientEventType, type ProctorEvent, type ProctorEventType } from "./proctoring";

/**
 * Tier pre-assessments: a proctored entry test a learner must pass before they
 * can pay for the tier, and before its modules open to them, wherever those
 * modules are sold (e.g. the Professional modules inside "Full Programme").
 *
 *  - Questions are drawn at random, spread evenly across the assessment's
 *    banks, and never repeat a question the learner has seen in an earlier
 *    attempt. When too few new ones are left, no further attempt can start.
 *  - Proctoring (see ./proctoring.ts): server-enforced time limit, full screen,
 *    one window, strikes for leaving the page, copying or pasting, and webcam
 *    stills. Too many strikes end the attempt as a fail.
 *
 * An assessment only gates while it is enabled and its banks hold at least one
 * question, so a half-built one never blocks sales. Enrolments with
 * `preAssessmentWaived` (an admin's choice) skip it.
 */

/** Pre-assessments that currently gate enrolment. */
export const activeAssessmentWhere = {
  enabled: true,
  banks: { some: { questions: { some: {} } } },
} satisfies Prisma.PreAssessmentWhereInput;

const HOUR = 60 * 60 * 1000;
/** Extra time allowed after the deadline for a slow network to deliver the last answers. */
const GRACE_MS = 30_000;
/** Silence longer than this between check-ins is logged as OFFLINE. */
const OFFLINE_AFTER_MS = 60_000;
const MAX_EVENTS = 500;
const MAX_SNAPSHOTS = 300;

/* ------------------------------------------------------------------ *
 * Access
 * ------------------------------------------------------------------ */

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

/**
 * Which modules the learner's ACTIVE enrolments open, and which they hold but
 * are still waiting on a pre-assessment for (module id → that assessment's tier id).
 *
 * A tier's pre-assessment guards its modules in that tier and in any bigger
 * tier that contains all of them (e.g. Professional inside Full Programme).
 * A smaller tier that happens to share a module (e.g. Foundation) isn't affected.
 */
export async function getModuleAccess(userId: string) {
  const open = new Set<string>();
  const awaiting = new Map<string, string>();
  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    select: { preAssessmentWaived: true, tier: { select: { modules: { select: { moduleId: true } } } } },
  });
  if (enrolments.length === 0) return { open, awaiting };

  const gates = await prisma.preAssessment.findMany({
    where: { ...activeAssessmentWhere, attempts: { none: { userId, passed: true } } },
    select: { tierId: true, tier: { select: { modules: { select: { moduleId: true } } } } },
  });
  const unpassed = gates
    .map((g) => ({ tierId: g.tierId, modules: new Set(g.tier.modules.map((m) => m.moduleId)) }))
    .filter((g) => g.modules.size > 0);

  for (const e of enrolments) {
    const mods = new Set(e.tier.modules.map((m) => m.moduleId));
    const guards = e.preAssessmentWaived ? [] : unpassed.filter((g) => [...g.modules].every((id) => mods.has(id)));
    for (const id of mods) {
      const guard = guards.find((g) => g.modules.has(id));
      if (guard) awaiting.set(id, guard.tierId);
      else open.add(id);
    }
  }
  for (const id of open) awaiting.delete(id);
  return { open, awaiting };
}

/* ------------------------------------------------------------------ *
 * Drawing questions
 * ------------------------------------------------------------------ */

/** The question ids in each of the assessment's banks. */
async function bankQuestionIds(assessmentId: string) {
  const banks = await prisma.questionBank.findMany({
    where: { assessments: { some: { id: assessmentId } } },
    select: { questions: { select: { id: true } } },
  });
  return banks.map((b) => b.questions.map((q) => q.id));
}

/** Every question this learner has ever been shown in a pre-assessment (reset and voided attempts included). */
async function seenQuestionIds(userId: string) {
  const rows = await prisma.preAssessmentAttempt.findMany({ where: { userId }, select: { questionIds: true } });
  return new Set(rows.flatMap((r) => r.questionIds as string[]));
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

/* ------------------------------------------------------------------ *
 * Attempt state
 * ------------------------------------------------------------------ */

export type PreAssessmentStatus =
  | { kind: "passed"; score: number }
  | { kind: "in-progress"; attemptId: string }
  | { kind: "ready" }
  | { kind: "wait"; until: Date }
  | { kind: "no-attempts" }
  /** Every remaining question has been seen in an earlier attempt. */
  | { kind: "no-questions" };

type Tx = Prisma.TransactionClient;

const isExpired = (deadline: Date | null, now = new Date()) =>
  deadline !== null && now.getTime() > deadline.getTime() + GRACE_MS;

const event = (type: ProctorEventType, detail?: string): ProctorEvent => ({
  at: new Date().toISOString(),
  type,
  ...(PROCTOR_EVENTS[type].strike ? { strike: true } : {}),
  ...(detail ? { detail } : {}),
});

/**
 * Run `fn` with the attempt's row locked, so check-ins, submits and timeouts
 * for one attempt never interleave (and a result can't be overwritten).
 */
async function withAttempt<T>(attemptId: string, fn: (tx: Tx, attempt: LockedAttempt) => Promise<T>, userId?: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PreAssessmentAttempt" WHERE id = ${attemptId} FOR UPDATE`;
      const attempt = await tx.preAssessmentAttempt.findFirst({
        where: { id: attemptId, ...(userId ? { userId } : {}) },
        include: { assessment: { select: { tierId: true, passMark: true, proctored: true, maxStrikes: true } } },
      });
      return fn(tx, attempt as LockedAttempt);
    },
    { timeout: 15_000 }
  );
}
type LockedAttempt = Prisma.PreAssessmentAttemptGetPayload<{
  include: { assessment: { select: { tierId: true; passMark: true; proctored: true; maxStrikes: true } } };
}> | null;

/** Mark an open attempt and close it. TERMINATED attempts always fail. */
async function finish(
  tx: Tx,
  attempt: NonNullable<LockedAttempt>,
  reason: PreAssessmentEnd,
  answers: Record<string, string[]>,
  extra: ProctorEvent[] = []
) {
  const questions = await tx.bankQuestion.findMany({ where: { id: { in: attempt.questionIds as string[] } } });
  const score = questions.length ? gradeAnswers(questions, answers).score : 0;
  const passed = reason !== "TERMINATED" && score >= attempt.assessment.passMark;
  const events = [...(attempt.events as unknown as ProctorEvent[]), ...extra, event(reason)].slice(-MAX_EVENTS);
  await tx.preAssessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      answers,
      score,
      passed,
      strikes: attempt.strikes,
      submittedAt: new Date(),
      endReason: reason,
      events: events as unknown as Prisma.InputJsonValue,
    },
  });
  return { score, passed, reason };
}

const savedAnswers = (a: { answers: Prisma.JsonValue }) => (a.answers ?? {}) as Record<string, string[]>;

/** Close the learner's open attempts whose time ran out (marked on the answers saved before the deadline). */
async function closeExpired(userId: string, assessmentId: string) {
  const open = await prisma.preAssessmentAttempt.findMany({
    where: { userId, assessmentId, submittedAt: null, deadline: { lt: new Date(Date.now() - GRACE_MS) } },
    select: { id: true },
  });
  for (const { id } of open) {
    await withAttempt(id, async (tx, a) => {
      if (a && !a.submittedAt) await finish(tx, a, "TIMED_OUT", savedAnswers(a));
    });
  }
}

/** Everything the learner page needs for one tier. Null when the tier has no active pre-assessment. */
export async function getPreAssessmentState(userId: string, tierId: string) {
  const found = await prisma.preAssessment.findFirst({ where: { tierId, ...activeAssessmentWhere }, select: { id: true } });
  if (!found) return null;
  await closeExpired(userId, found.id);

  const assessment = await prisma.preAssessment.findUniqueOrThrow({
    where: { id: found.id },
    include: { attempts: { where: { userId, resetAt: null }, orderBy: { startedAt: "desc" } } },
  });
  const [banks, seen] = await Promise.all([bankQuestionIds(assessment.id), seenQuestionIds(userId)]);
  const pool = new Set(banks.flat());
  const fresh = [...pool].filter((id) => !seen.has(id)).length;
  const questionCount = Math.min(assessment.questionCount, pool.size);

  const { attempts } = assessment;
  const submitted = attempts.filter((a) => a.submittedAt);
  const pass = submitted.find((a) => a.passed);
  const open = attempts.find((a) => !a.submittedAt);
  const last = submitted[0] ?? null;

  let status: PreAssessmentStatus;
  if (pass) status = { kind: "passed", score: pass.score ?? 0 };
  else if (open) status = { kind: "in-progress", attemptId: open.id };
  else if (assessment.maxAttempts !== null && attempts.length >= assessment.maxAttempts) status = { kind: "no-attempts" };
  else if (fresh < questionCount) status = { kind: "no-questions" };
  else if (last?.submittedAt && assessment.retakeAfterHours > 0) {
    const until = new Date(last.submittedAt.getTime() + assessment.retakeAfterHours * HOUR);
    status = until > new Date() ? { kind: "wait", until } : { kind: "ready" };
  } else status = { kind: "ready" };

  return {
    id: assessment.id,
    instructions: assessment.instructions,
    passMark: assessment.passMark,
    questionCount,
    maxAttempts: assessment.maxAttempts,
    retakeAfterHours: assessment.retakeAfterHours,
    timeLimitMinutes: assessment.timeLimitMinutes,
    proctored: assessment.proctored,
    maxStrikes: assessment.maxStrikes,
    // Stills need somewhere to go; without storage the camera isn't required.
    webcam: assessment.webcam && isStorageConfigured(),
    attemptsUsed: attempts.length,
    last: last && { score: last.score ?? 0, endReason: last.endReason, voided: Boolean(last.voidedAt), strikes: last.strikes },
    status,
  };
}

/** Start an attempt (or keep the one already open) with a fresh draw of questions the learner has never seen. */
export async function startAttempt(
  userId: string,
  tierId: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getPreAssessmentState(userId, tierId);
  if (!state) return { ok: false, error: "This tier doesn't need a pre-assessment." };
  switch (state.status.kind) {
    case "in-progress": {
      // Resume it, unless every question it drew has since been deleted.
      const left = await getOpenAttempt(userId, state.status.attemptId);
      if (left?.questions.length) return { ok: true };
      await prisma.preAssessmentAttempt.delete({ where: { id: state.status.attemptId } });
      break;
    }
    case "passed":
      return { ok: false, error: "You've already passed this pre-assessment." };
    case "no-attempts":
      return { ok: false, error: "You've used all your attempts." };
    case "no-questions":
      return { ok: false, error: "There aren't enough new questions for another attempt. Please contact us." };
    case "wait":
      return { ok: false, error: "You can't retake it just yet." };
  }
  const seen = await seenQuestionIds(userId);
  const banks = (await bankQuestionIds(state.id)).map((b) => b.filter((id) => !seen.has(id)));
  const questionIds = drawEvenly(banks, state.questionCount);
  if (questionIds.length === 0 || questionIds.length < state.questionCount) {
    return { ok: false, error: "There aren't enough new questions for another attempt. Please contact us." };
  }
  const now = new Date();
  await prisma.preAssessmentAttempt.create({
    data: {
      assessmentId: state.id,
      userId,
      questionIds,
      deadline: state.timeLimitMinutes ? new Date(now.getTime() + state.timeLimitMinutes * 60_000) : null,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      events: [event("STARTED")] as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

/** An open attempt for the player: its questions (no answers), saved answers, deadline and strikes. */
export async function getOpenAttempt(userId: string, attemptId: string) {
  const attempt = await prisma.preAssessmentAttempt.findFirst({
    where: { id: attemptId, userId, submittedAt: null },
    select: { questionIds: true, answers: true, deadline: true, strikes: true },
  });
  if (!attempt) return null;
  const ids = attempt.questionIds as string[];
  const rows = await prisma.bankQuestion.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((q) => [q.id, q]));
  // A question deleted from its bank after the draw is simply left out.
  const questions: LearnerQuestion[] = ids.flatMap((id) => {
    const q = byId.get(id);
    return q ? [toLearnerQuestion(q, true)] : [];
  });
  return {
    questions,
    answers: savedAnswers(attempt),
    deadline: attempt.deadline,
    strikes: attempt.strikes,
    // The player's countdown corrects for a wrong clock on the learner's device.
    serverNow: Date.now(),
  };
}

/* ------------------------------------------------------------------ *
 * Proctoring check-ins and submitting
 * ------------------------------------------------------------------ */

export interface CheckIn {
  clientId: string;
  answers?: Record<string, string[]>;
  events?: ClientEventType[];
}

export type CheckInResult =
  | { ok: true; ended: false; strikes: number }
  | { ok: true; ended: true; reason: PreAssessmentEnd; score: number; passed: boolean }
  | { ok: false; error: string };

/**
 * Apply one check-in from the learner's browser to a locked, open attempt:
 * log events and strikes, spot a second window or a long silence, and save
 * answers. Ends the attempt when time is up or the strikes run out.
 */
async function applyCheckIn(tx: Tx, a: NonNullable<LockedAttempt>, input: CheckIn, ip: string | null) {
  const now = new Date();
  const proctored = a.assessment.proctored;
  // Answers count only for this attempt's questions, and only before the deadline.
  const ids = new Set(a.questionIds as string[]);
  const inTime = !isExpired(a.deadline, now);
  const answers = input.answers && inTime
    ? Object.fromEntries(Object.entries(input.answers).filter(([id]) => ids.has(id)))
    : savedAnswers(a);

  const add: ProctorEvent[] = [];
  if (a.clientId && a.clientId !== input.clientId) add.push(event("NEW_WINDOW"));
  if (a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() > OFFLINE_AFTER_MS) {
    add.push(event("OFFLINE", `${Math.round((now.getTime() - a.lastSeenAt.getTime()) / 1000)}s`));
  }
  if (ip && a.ip && ip !== a.ip && !(a.events as unknown as ProctorEvent[]).some((e) => e.type === "NEW_IP" && e.detail === ip)) {
    add.push(event("NEW_IP", ip.slice(0, 64)));
  }
  for (const type of (input.events ?? []).slice(0, 20)) add.push(event(type));
  const newStrikes = proctored ? add.filter((e) => e.strike).length : 0;
  const strikes = a.strikes + newStrikes;

  if (!inTime) return { ended: await finish(tx, { ...a, strikes }, "TIMED_OUT", answers, add) };
  if (proctored && a.assessment.maxStrikes > 0 && strikes >= a.assessment.maxStrikes) {
    return { ended: await finish(tx, { ...a, strikes }, "TERMINATED", answers, add) };
  }
  const events = [...(a.events as unknown as ProctorEvent[]), ...add].slice(-MAX_EVENTS) as unknown as Prisma.JsonValue;
  await tx.preAssessmentAttempt.update({
    where: { id: a.id },
    data: {
      answers,
      strikes,
      clientId: input.clientId,
      lastSeenAt: now,
      events: events as Prisma.InputJsonValue,
    },
  });
  return { ended: null, strikes, answers, events };
}

/** A heartbeat from the player: autosave answers and record proctoring events. */
export async function checkIn(userId: string, attemptId: string, input: CheckIn, ip: string | null): Promise<CheckInResult> {
  return withAttempt(
    attemptId,
    async (tx, a) => {
      if (!a) return { ok: false, error: "Attempt not found." };
      if (a.submittedAt) {
        return { ok: true, ended: true, reason: a.endReason ?? "SUBMITTED", score: a.score ?? 0, passed: a.passed };
      }
      const r = await applyCheckIn(tx, a, input, ip);
      return r.ended ? { ok: true, ended: true, ...r.ended } : { ok: true, ended: false, strikes: r.strikes };
    },
    userId
  );
}

/**
 * Submit an open attempt (or, when its time has run out, mark the answers
 * saved before the deadline). Answers are never revealed, so the bank stays useful.
 */
export async function submitAttempt(
  userId: string,
  tierId: string,
  attemptId: string,
  input: CheckIn,
  ip: string | null
): Promise<{ ok: true; score: number; passed: boolean; reason: PreAssessmentEnd } | { ok: false; error: string }> {
  return withAttempt(
    attemptId,
    async (tx, a) => {
      if (!a || a.assessment.tierId !== tierId || a.submittedAt) {
        return { ok: false, error: "This attempt has already been submitted." };
      }
      const r = await applyCheckIn(tx, a, input, ip);
      if (r.ended) return { ok: true, ...r.ended };
      return { ok: true, ...(await finish(tx, { ...a, strikes: r.strikes, events: r.events }, "SUBMITTED", r.answers)) };
    },
    userId
  );
}

/** Store a webcam still for an open, webcam-proctored attempt. */
export async function saveSnapshot(userId: string, attemptId: string, jpeg: Uint8Array): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isStorageConfigured()) return { ok: false, error: "Storage isn't configured.", status: 503 };
  if (jpeg.length < 500 || jpeg.length > SNAPSHOT_MAX_BYTES || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    return { ok: false, error: "Invalid image.", status: 400 };
  }
  const attempt = await prisma.preAssessmentAttempt.findFirst({
    where: { id: attemptId, userId, submittedAt: null, assessment: { webcam: true } },
    select: {
      assessmentId: true,
      _count: { select: { snapshots: true } },
      snapshots: { orderBy: { takenAt: "desc" }, take: 1, select: { takenAt: true } },
    },
  });
  if (!attempt) return { ok: false, error: "Attempt not found.", status: 404 };
  const lastAt = attempt.snapshots[0]?.takenAt.getTime() ?? 0;
  if (attempt._count.snapshots >= MAX_SNAPSHOTS || Date.now() - lastAt < 20_000) {
    return { ok: false, error: "Too many photos.", status: 429 };
  }
  const key = `proctoring/${attempt.assessmentId}/${attemptId}/${Date.now()}.jpg`;
  await putObject(key, jpeg, "image/jpeg");
  await prisma.preAssessmentSnapshot.create({ data: { attemptId, key } });
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

/**
 * Clear a learner's attempts so they can start again. The attempts stay (so
 * their questions are never shown to the learner again) but no longer count.
 */
export async function resetAttempts(userId: string, tierId: string) {
  const now = new Date();
  await prisma.preAssessmentAttempt.updateMany({
    where: { userId, assessment: { tierId }, resetAt: null, passed: false },
    data: { resetAt: now },
  });
  await prisma.preAssessmentAttempt.updateMany({
    where: { userId, assessment: { tierId }, submittedAt: null },
    data: { submittedAt: now },
  });
}

/** Overturn a submitted attempt's result after review: it becomes a fail, and access it opened closes again. */
export async function voidAttempt(attemptId: string, reason: string) {
  await prisma.preAssessmentAttempt.update({
    where: { id: attemptId },
    data: { passed: false, voidedAt: new Date(), voidReason: reason.slice(0, 500) },
  });
}
