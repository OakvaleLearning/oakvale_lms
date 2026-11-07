"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { preAssessmentSchema, questionBankSchema, questionSchema } from "@/lib/validation";

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
}

/* ------------------------------------------------------------------ *
 * Banks
 * ------------------------------------------------------------------ */

export async function createBank(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = questionBankSchema.safeParse({ title: text(fd, "title"), description: text(fd, "description") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const bank = await prisma.questionBank.create({ data: parsed.data });
  refresh();
  redirect(`/admin/question-banks/${bank.id}`);
}

export async function updateBank(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = questionBankSchema.safeParse({ title: text(fd, "title"), description: text(fd, "description") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await prisma.questionBank.update({ where: { id }, data: parsed.data });
  refresh();
  return { ok: true };
}

export async function deleteBank(id: string): Promise<ActionState> {
  await requireAdmin();
  // Deleting a bank a pre-assessment draws from would silently change (or switch off) that test.
  const users = await prisma.preAssessment.findMany({
    where: { banks: { some: { id } } },
    select: { tier: { select: { name: true, program: { select: { title: true } } } } },
  });
  if (users.length > 0) {
    const names = users.map((u) => `${u.tier.program.title}: ${u.tier.name}`).join(", ");
    return { error: `Used by the pre-assessment for ${names}. Remove it there first.` };
  }
  await prisma.questionBank.delete({ where: { id } });
  refresh();
  redirect("/admin/question-banks");
}

/* ------------------------------------------------------------------ *
 * Bank questions
 * ------------------------------------------------------------------ */

export async function saveBankQuestion(bankId: string, questionId: string | null, input: unknown): Promise<Result> {
  await requireAdmin();
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
  refresh();
  return { ok: true };
}

export async function deleteBankQuestion(bankId: string, questionId: string): Promise<void> {
  await requireAdmin();
  await prisma.bankQuestion.deleteMany({ where: { id: questionId, bankId } });
  refresh();
}

/** Copy every question of a lesson quiz or final assessment into the bank. */
export async function importQuizQuestions(bankId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
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
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Tier pre-assessments
 * ------------------------------------------------------------------ */

export async function updatePreAssessment(tierId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const maxAttempts = text(fd, "maxAttempts");
  const parsed = preAssessmentSchema.safeParse({
    enabled: fd.get("enabled") === "on",
    instructions: text(fd, "instructions"),
    questionCount: text(fd, "questionCount"),
    passMark: text(fd, "passMark"),
    maxAttempts: maxAttempts === "" ? undefined : maxAttempts,
    retakeAfterHours: text(fd, "retakeAfterHours") || 0,
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
  const fields = { ...data, maxAttempts: data.maxAttempts ?? null, banks: { set: banks.map((b) => ({ id: b.id })) } };
  await prisma.preAssessment.upsert({
    where: { tierId },
    update: fields,
    create: { tierId, ...fields, banks: { connect: banks.map((b) => ({ id: b.id })) } },
  });
  refresh();
  return { ok: true };
}

/** Let a learner start again: removes their attempts at this tier's pre-assessment. */
export async function resetPreAssessmentAttempts(tierId: string, userId: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.preAssessmentAttempt.deleteMany({ where: { userId, assessment: { tierId } } });
  refresh();
  return { ok: true };
}
