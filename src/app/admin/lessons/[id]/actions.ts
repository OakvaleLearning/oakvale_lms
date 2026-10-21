"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { ensureUploadCors, isStorageConfigured, presignUpload } from "@/lib/storage";
import { ingestPackage, removeAssetFiles } from "@/lib/lms/packages";
import { DIFFICULTIES, GENERATE_COUNTS, generateQuizDraft } from "@/lib/lms/quiz-generator";
import { questionSchema, quizSettingsSchema } from "@/lib/validation";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh(lessonId: string) {
  revalidatePath(`/admin/lessons/${lessonId}`);
  revalidatePath("/learn", "layout");
}

/* ------------------------------------------------------------------ *
 * Uploads (video, audio, SCORM, HTML) — browser → R2 directly
 * ------------------------------------------------------------------ */

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/** What each lesson type accepts. R2 single PUTs top out just under 5 GB. */
const ACCEPT = {
  VIDEO: { types: ["video/mp4", "video/webm", "video/quicktime"], ext: /\.(mp4|webm|mov)$/i, max: 4.9 * GB, label: "an MP4, WebM or MOV video" },
  AUDIO: { types: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac"], ext: /\.(mp3|m4a|wav|ogg|aac|webm)$/i, max: 1 * GB, label: "an MP3, M4A, WAV, AAC or OGG file" },
  SCORM: { types: ["application/zip", "application/x-zip-compressed", "application/octet-stream", ""], ext: /\.zip$/i, max: 300 * MB, label: "a SCORM .zip package" },
  HTML: { types: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "text/html", ""], ext: /\.(zip|html?)$/i, max: 300 * MB, label: "a .zip or .html file" },
} as const;

/** Step 1: register the upload and hand back a presigned PUT URL. */
export async function createUpload(
  lessonId: string,
  file: { name: string; type: string; size: number }
): Promise<Result<{ assetId: string; uploadUrl: string; contentType: string }>> {
  await requireAdmin();
  if (!isStorageConfigured()) {
    return { ok: false, error: "File storage (AWS S3) is not configured yet." };
  }
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { asset: true } });
  if (!lesson || lesson.type === "QUIZ") return { ok: false, error: "Lesson not found." };

  const rule = ACCEPT[lesson.type];
  const type = String(file.type ?? "");
  const name = String(file.name ?? "").slice(0, 200);
  if (!rule.ext.test(name) || !(rule.types as readonly string[]).includes(type)) {
    return { ok: false, error: `Please upload ${rule.label}.` };
  }
  if (!(file.size > 0) || file.size > rule.max) {
    return { ok: false, error: `That file is too large (max ${Math.round(rule.max / MB)} MB).` };
  }

  const corsError = await ensureUploadCors(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").origin);
  if (corsError) return { ok: false, error: corsError };

  // Replacing content: remove the old asset and its files first.
  if (lesson.asset) {
    await prisma.contentAsset.delete({ where: { id: lesson.asset.id } });
    await removeAssetFiles([lesson.asset]);
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const contentType = type || "application/octet-stream";
  const asset = await prisma.contentAsset.create({
    data: {
      lessonId,
      storageKey: `uploads/${randomUUID()}/${safeName}`,
      fileName: name,
      mimeType: contentType,
      sizeBytes: file.size <= 2_147_483_647 ? Math.round(file.size) : null,
    },
  });
  const uploadUrl = await presignUpload(asset.storageKey, contentType);
  refresh(lessonId);
  return { ok: true, assetId: asset.id, uploadUrl, contentType };
}

/** Step 2: after the browser finished uploading — media is ready, packages get unpacked. */
export async function finalizeUpload(
  assetId: string,
  info: { durationSec?: number } = {}
): Promise<Result> {
  await requireAdmin();
  const asset = await prisma.contentAsset.findUnique({ where: { id: assetId }, include: { lesson: true } });
  if (!asset) return { ok: false, error: "Upload not found." };

  if (asset.lesson.type === "VIDEO" || asset.lesson.type === "AUDIO") {
    await prisma.contentAsset.update({ where: { id: assetId }, data: { status: "READY" } });
    const duration = Number(info.durationSec);
    if (Number.isFinite(duration) && duration > 0 && duration < 24 * 3600) {
      await prisma.lesson.update({ where: { id: asset.lessonId }, data: { durationSec: Math.round(duration) } });
    }
  } else {
    await ingestPackage(assetId);
  }
  refresh(asset.lessonId);
  const fresh = await prisma.contentAsset.findUnique({ where: { id: assetId } });
  return fresh?.status === "FAILED" ? { ok: false, error: fresh.error ?? "Processing failed." } : { ok: true };
}

export async function removeAsset(lessonId: string): Promise<void> {
  await requireAdmin();
  const asset = await prisma.contentAsset.findUnique({ where: { lessonId } });
  if (!asset) return;
  await prisma.contentAsset.delete({ where: { id: asset.id } });
  await removeAssetFiles([asset]);
  refresh(lessonId);
}

/* ------------------------------------------------------------------ *
 * Quiz
 * ------------------------------------------------------------------ */

export async function updateQuizSettings(
  lessonId: string,
  _prev: { error?: string; ok?: boolean } | undefined,
  fd: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const parsed = quizSettingsSchema.safeParse({
    kind: fd.get("kind") || undefined,
    passMark: fd.get("passMark"),
    maxAttempts: fd.get("maxAttempts") || undefined,
    shuffle: fd.get("shuffle") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  await prisma.quiz.upsert({
    where: { lessonId },
    update: { ...parsed.data, maxAttempts: parsed.data.maxAttempts ?? null },
    create: { lessonId, ...parsed.data, maxAttempts: parsed.data.maxAttempts ?? null },
  });
  refresh(lessonId);
  return { ok: true };
}

export async function saveQuestion(
  lessonId: string,
  questionId: string | null,
  input: unknown
): Promise<Result> {
  await requireAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid question" };
  const { options, correct, explanation, ...rest } = parsed.data;
  const data = {
    ...rest,
    options: options as Prisma.InputJsonValue,
    correct: correct as Prisma.InputJsonValue,
    explanation: explanation || null,
  };

  const quiz = await prisma.quiz.upsert({ where: { lessonId }, update: {}, create: { lessonId } });
  if (questionId) {
    const updated = await prisma.question.updateMany({ where: { id: questionId, quizId: quiz.id }, data });
    if (updated.count === 0) return { ok: false, error: "Question not found." };
  } else {
    const max = await prisma.question.aggregate({ where: { quizId: quiz.id }, _max: { order: true } });
    await prisma.question.create({ data: { ...data, quizId: quiz.id, order: (max._max.order ?? -1) + 1 } });
  }
  refresh(lessonId);
  return { ok: true };
}

export async function deleteQuestion(lessonId: string, questionId: string): Promise<void> {
  await requireAdmin();
  await prisma.question.deleteMany({ where: { id: questionId, quiz: { lessonId } } });
  refresh(lessonId);
}

const generateSchema = z.object({
  sourceLessonIds: z.array(z.string().max(40)).min(1, "Pick at least one lesson to base the questions on").max(100),
  count: z.coerce.number().refine((n) => (GENERATE_COUNTS as readonly number[]).includes(n), "Pick how many questions"),
  types: z.array(z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE"])).min(1, "Pick at least one question type"),
  difficulty: z.enum(DIFFICULTIES),
  focus: z.string().trim().max(500).default(""),
  replace: z.boolean().default(false),
});

/** Draft questions with AI from the chosen lessons, then save them to this quiz. */
export async function generateQuestions(lessonId: string, input: unknown): Promise<Result<{ created: number }>> {
  await requireAdmin();
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { replace, ...options } = parsed.data;

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { type: true } });
  if (lesson?.type !== "QUIZ") return { ok: false, error: "Lesson not found." };
  const quiz = await prisma.quiz.upsert({
    where: { lessonId },
    update: {},
    create: { lessonId },
    include: { questions: { select: { prompt: true, order: true } } },
  });

  const draft = await generateQuizDraft({
    quizLessonId: lessonId,
    ...options,
    existing: replace ? [] : quiz.questions.map((q) => q.prompt),
  });
  if (!draft.ok) return draft;

  const valid = draft.questions.filter((q) => questionSchema.safeParse(q).success);
  if (valid.length === 0) return { ok: false, error: "The AI's questions didn't come out usable. Please try again." };
  const start = replace ? 0 : Math.max(-1, ...quiz.questions.map((q) => q.order)) + 1;

  await prisma.$transaction([
    ...(replace ? [prisma.question.deleteMany({ where: { quizId: quiz.id } })] : []),
    prisma.question.createMany({
      data: valid.map((q, i) => ({
        quizId: quiz.id,
        order: start + i,
        type: q.type,
        prompt: q.prompt,
        options: q.options as Prisma.InputJsonValue,
        correct: q.correct as Prisma.InputJsonValue,
        explanation: q.explanation || null,
      })),
    }),
  ]);
  refresh(lessonId);
  return { ok: true, created: valid.length };
}
