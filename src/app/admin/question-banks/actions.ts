"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { preAssessmentSchema, questionBankSchema, questionSchema } from "@/lib/validation";
import { resetAttempts, voidAttempt } from "@/lib/lms/pre-assessment";
import { audit, changes } from "@/lib/audit";

const bankName = async (id: string) =>
  `“${(await prisma.questionBank.findUnique({ where: { id }, select: { title: true } }))?.title ?? "a bank"}”`;

/**
 * Question banks and the tier pre-assessments that draw from them.
 * Every action re-checks the admin session.
 */

type ActionState = { error?: string; ok?: boolean } | undefined;
type Result = { ok: true } | { ok: false; error: string };

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Invalid input";

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/enroll");
  revalidatePath("/learn", "layout");
  revalidatePath("/pre-assessment/[tierId]", "page");
}

/* ------------------------------------------------------------------ *
 * Banks
 * ------------------------------------------------------------------ */

export async function createBank(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = questionBankSchema.safeParse({ title: text(fd, "title"), description: text(fd, "description") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const bank = await prisma.questionBank.create({ data: parsed.data });
  await audit(admin, "bank.create", `Created question bank “${bank.title}”`, { target: ["bank", bank.id] });
  refresh();
  redirect(`/admin/question-banks/${bank.id}`);
}

export async function updateBank(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = questionBankSchema.safeParse({ title: text(fd, "title"), description: text(fd, "description") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const before = await prisma.questionBank.findUniqueOrThrow({ where: { id } });
  await prisma.questionBank.update({ where: { id }, data: parsed.data });
  const diff = changes(before, parsed.data);
  if (Object.keys(diff).length) {
    await audit(admin, "bank.update", `Edited question bank “${parsed.data.title}”`, { target: ["bank", id], details: diff });
  }
  refresh();
  return { ok: true };
}

export async function deleteBank(id: string): Promise<ActionState> {
  const admin = await requireAdmin();
  // Deleting a bank a pre-assessment draws from would silently change (or switch off) that test.
  const users = await prisma.preAssessment.findMany({
    where: { banks: { some: { id } } },
    select: { tier: { select: { name: true, program: { select: { title: true } } } } },
  });
  if (users.length > 0) {
    const names = users.map((u) => `${u.tier.program.title}: ${u.tier.name}`).join(", ");
    return { error: `Used by the pre-assessment for ${names}. Remove it there first.` };
  }
  const bank = await prisma.questionBank.delete({ where: { id }, include: { _count: { select: { questions: true } } } });
  await audit(admin, "bank.delete", `Deleted question bank “${bank.title}” (${bank._count.questions} questions)`, { target: ["bank", id] });
  refresh();
  redirect("/admin/question-banks");
}

/* ------------------------------------------------------------------ *
 * Bank questions
 * ------------------------------------------------------------------ */

export async function saveBankQuestion(bankId: string, questionId: string | null, input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { options, correct, explanation, ...rest } = parsed.data;
  const data = {
    ...rest,
    options: options as Prisma.InputJsonValue,
    correct: correct as Prisma.InputJsonValue,
    explanation: explanation || null,
  };

  if (questionId) {
    const updated = await prisma.bankQuestion.updateMany({ where: { id: questionId, bankId }, data });
    if (updated.count === 0) return { ok: false, error: "Question not found." };
  } else {
    if (!(await prisma.questionBank.findUnique({ where: { id: bankId }, select: { id: true } }))) {
      return { ok: false, error: "Question bank not found." };
    }
    const max = await prisma.bankQuestion.aggregate({ where: { bankId }, _max: { order: true } });
    await prisma.bankQuestion.create({ data: { ...data, bankId, order: (max._max.order ?? -1) + 1 } });
  }
  await audit(admin, questionId ? "bank.questionUpdate" : "bank.questionCreate", `${questionId ? "Edited" : "Added"} a question in ${await bankName(bankId)}`, {
    target: ["bank", bankId],
    details: { prompt: rest.prompt.slice(0, 200) },
  });
  refresh();
  return { ok: true };
}

export async function deleteBankQuestion(bankId: string, questionId: string): Promise<void> {
  const admin = await requireAdmin();
  const q = await prisma.bankQuestion.findFirst({ where: { id: questionId, bankId }, select: { prompt: true } });
  const { count } = await prisma.bankQuestion.deleteMany({ where: { id: questionId, bankId } });
  if (count) {
    await audit(admin, "bank.questionDelete", `Deleted a question from ${await bankName(bankId)}`, {
      target: ["bank", bankId],
      details: { prompt: q?.prompt.slice(0, 200) },
    });
  }
  refresh();
}

/** Copy every question of a lesson quiz or final assessment into the bank. */
export async function importQuizQuestions(bankId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const lessonId = text(fd, "lessonId");
  if (!lessonId) return { error: "Choose a quiz to copy from" };
  const quiz = await prisma.quiz.findUnique({ where: { lessonId }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!quiz || quiz.questions.length === 0) return { error: "That quiz has no questions." };
  const max = await prisma.bankQuestion.aggregate({ where: { bankId }, _max: { order: true } });
  const start = (max._max.order ?? -1) + 1;
  await prisma.bankQuestion.createMany({
    data: quiz.questions.map((q, i) => ({
      bankId,
      order: start + i,
      type: q.type,
      prompt: q.prompt,
      options: q.options as Prisma.InputJsonValue,
      correct: q.correct as Prisma.InputJsonValue,
      explanation: q.explanation,
      points: q.points,
    })),
  });
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } });
  await audit(admin, "bank.import", `Copied ${quiz.questions.length} questions from “${lesson?.title}” into ${await bankName(bankId)}`, {
    target: ["bank", bankId],
  });
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Tier pre-assessments
 * ------------------------------------------------------------------ */

export async function updatePreAssessment(tierId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const maxAttempts = text(fd, "maxAttempts");
  const timeLimit = text(fd, "timeLimitMinutes");
  const parsed = preAssessmentSchema.safeParse({
    enabled: fd.get("enabled") === "on",
    instructions: text(fd, "instructions"),
    questionCount: text(fd, "questionCount"),
    passMark: text(fd, "passMark"),
    maxAttempts: maxAttempts === "" ? undefined : maxAttempts,
    retakeAfterHours: text(fd, "retakeAfterHours") || 0,
    timeLimitMinutes: timeLimit === "" ? undefined : timeLimit,
    proctored: fd.get("proctored") === "on",
    maxStrikes: text(fd, "maxStrikes") || 0,
    webcam: fd.get("webcam") === "on",
    secondsPerQuestion: text(fd, "secondsPerQuestion") || undefined,
    bankIds: fd.getAll("bankIds").map(String),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { bankIds, ...data } = parsed.data;

  const banks = await prisma.questionBank.findMany({
    where: { id: { in: bankIds } },
    select: { id: true, _count: { select: { questions: true } } },
  });
  if (data.enabled && !banks.some((b) => b._count.questions > 0)) {
    return { error: "The chosen banks have no questions yet. Add some before switching it on." };
  }
  const fields = {
    ...data,
    maxAttempts: data.maxAttempts ?? null,
    timeLimitMinutes: data.timeLimitMinutes ?? null,
    secondsPerQuestion: data.secondsPerQuestion ?? null,
    banks: { set: banks.map((b) => ({ id: b.id })) } };
  const before = await prisma.preAssessment.findUnique({ where: { tierId }, include: { banks: { select: { id: true } } } });
  await prisma.preAssessment.upsert({
    where: { tierId },
    update: fields,
    create: { tierId, ...fields, banks: { connect: banks.map((b) => ({ id: b.id })) } },
  });
  const after = {
    ...data,
    maxAttempts: data.maxAttempts ?? null,
    timeLimitMinutes: data.timeLimitMinutes ?? null,
    secondsPerQuestion: data.secondsPerQuestion ?? null,
    bankIds: banks.map((b) => b.id) };
  const diff = before ? changes({ ...before, bankIds: before.banks.map((b) => b.id) }, after) : after;
  if ("instructions" in diff) diff.instructions = ["…", "(changed)"];
  if (Object.keys(diff).length) {
    const tier = await prisma.tier.findUnique({ where: { id: tierId }, select: { name: true, program: { select: { title: true } } } });
    const verb = "enabled" in diff ? (data.enabled ? "Switched on" : "Switched off") : "Changed";
    await audit(admin, "preAssessment.update", `${verb} the pre-assessment for ${tier?.program.title}: ${tier?.name}`, {
      target: ["tier", tierId],
      details: diff,
    });
  }
  refresh();
  return { ok: true };
}

/**
 * Let a learner start again. Their attempts stop counting, but stay on record
 * so they're never shown the same questions again.
 */
export async function resetPreAssessmentAttempts(tierId: string, userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  await resetAttempts(userId, tierId);
  const [learner, tier] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.tier.findUnique({ where: { id: tierId }, select: { name: true } }),
  ]);
  await audit(admin, "preAssessment.reset", `Reset ${learner?.name}'s ${tier?.name} pre-assessment attempts`, { target: ["user", userId] });
  refresh();
  return { ok: true };
}

/** Cancel an attempt's result after reviewing its proctoring log: it becomes a fail, and any access it opened closes. */
export async function voidPreAssessmentAttempt(attemptId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const reason = text(fd, "reason");
  if (!reason) return { error: "Say why the result is being cancelled." };
  const attempt = await prisma.preAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { submittedAt: true, voidedAt: true } });
  if (!attempt?.submittedAt) return { error: "Only a finished attempt can be cancelled." };
  if (attempt.voidedAt) return { error: "This result is already cancelled." };
  await voidAttempt(attemptId, reason);
  const a = await prisma.preAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { score: true, user: { select: { id: true, name: true } }, assessment: { select: { tier: { select: { name: true } } } } },
  });
  await audit(admin, "preAssessment.void", `Cancelled ${a?.user.name}'s ${a?.assessment.tier.name} pre-assessment result (${a?.score ?? 0}%)`, {
    target: ["user", a?.user.id ?? ""],
    details: { attemptId, reason },
  });
  refresh();
  return { ok: true };
}
