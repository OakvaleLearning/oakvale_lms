"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured, presignUpload } from "@/lib/storage";
import { ingestPackage, removeAssetFiles } from "@/lib/lms/packages";
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
    return { ok: false, error: "File storage (Cloudflare R2) is not configured yet." };
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
