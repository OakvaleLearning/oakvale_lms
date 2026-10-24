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
import {
  BLOCK_LABEL,
  BLOCK_TYPES,
  isFileBlock,
  MAX_TEXT_CHARS,
  minutesToSeconds,
  ONE_PER_LESSON,
  UPLOAD_RULES,
} from "@/lib/lms/blocks";
import { renumberBlocks, syncLesson } from "@/lib/lms/lesson-parts";
import { reconcileLessonProgress } from "@/lib/lms/progress";
import { questionSchema, quizSettingsSchema } from "@/lib/validation";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh(lessonId: string) {
  revalidatePath(`/admin/lessons/${lessonId}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/learn", "layout");
}

/* ------------------------------------------------------------------ *
 * Parts of a lesson
 * ------------------------------------------------------------------ */

/** Add a part to a lesson, at `position` (0 = first; default last). */
export async function addBlock(lessonId: string, type: unknown, position?: number): Promise<Result<{ blockId: string }>> {
  await requireAdmin();
  const kind = z.enum(BLOCK_TYPES).safeParse(type);
  if (!kind.success) return { ok: false, error: "Unknown kind of part." };

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      quiz: { select: { kind: true } },
      blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, type: true } },
    },
  });
  if (!lesson) return { ok: false, error: "Lesson not found." };
  if (lesson.quiz?.kind === "EXAM") {
    return { ok: false, error: "A final assessment holds only its questions. Add this to a regular lesson instead." };
  }
  if (ONE_PER_LESSON.includes(kind.data) && lesson.blocks.some((b) => b.type === kind.data)) {
    return { ok: false, error: `A lesson can have one ${BLOCK_LABEL[kind.data].toLowerCase()} part.` };
  }

  const created = await prisma.lessonBlock.create({
    data: { lessonId, type: kind.data, order: lesson.blocks.length },
    select: { id: true },
  });
  if (kind.data === "QUIZ") await prisma.quiz.upsert({ where: { lessonId }, update: {}, create: { lessonId } });

  const at = Math.min(Math.max(Math.trunc(Number(position ?? lesson.blocks.length)) || 0, 0), lesson.blocks.length);
  if (at < lesson.blocks.length) {
    const ids = lesson.blocks.map((b) => b.id);
    ids.splice(at, 0, created.id);
    await prisma.$transaction(ids.map((id, order) => prisma.lessonBlock.update({ where: { id }, data: { order } })));
  }
  await syncLesson(lessonId);
  refresh(lessonId);
  return { ok: true, blockId: created.id };
}

const partSchema = z.object({
  title: z.string().trim().max(200).optional(),
  required: z.boolean().optional(),
  /** Document parts: show Download / Open-in-new-tab buttons. */
  allowDownload: z.boolean().optional(),
  /** Estimated time in minutes; null clears it. */
  durationMin: z.number().min(0).max(24 * 60).nullable().optional(),
  body: z.string().max(MAX_TEXT_CHARS, "That's too long for one part. Split it into two.").optional(),
});

/** Change a part's heading, whether it's required, its estimated time, or (for text parts) its content. */
export async function updateBlock(blockId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = partSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { title, required, allowDownload, durationMin, body } = parsed.data;

  const block = await prisma.lessonBlock.findUnique({ where: { id: blockId }, select: { lessonId: true, type: true, required: true } });
  if (!block) return { ok: false, error: "Part not found." };

  await prisma.lessonBlock.update({
    where: { id: blockId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(required !== undefined ? { required } : {}),
      ...(allowDownload !== undefined && block.type === "DOCUMENT" ? { allowDownload } : {}),
      ...(body !== undefined && block.type === "TEXT" ? { body } : {}),
      ...(durationMin !== undefined ? { durationSec: durationMin ? minutesToSeconds(durationMin) : null } : {}),
    },
  });
  if (durationMin !== undefined) await syncLesson(block.lessonId);
  // Making a part optional may complete lessons for learners who were only missing it.
  if (required === false && block.required) await reconcileLessonProgress(block.lessonId);
  refresh(block.lessonId);
  return { ok: true };
}

/** Remove a part, with its file (or, for a quiz part, the quiz and learners' attempts). */
export async function deleteBlock(blockId: string): Promise<Result> {
  await requireAdmin();
  const block = await prisma.lessonBlock.findUnique({
    where: { id: blockId },
    select: { lessonId: true, type: true, asset: { select: { id: true, storageKey: true } } },
  });
  if (!block) return { ok: true };

  if (block.type === "QUIZ") await prisma.quiz.deleteMany({ where: { lessonId: block.lessonId } });
  await prisma.lessonBlock.delete({ where: { id: blockId } });
  if (block.asset) await removeAssetFiles([block.asset]);

  await renumberBlocks(block.lessonId);
  await syncLesson(block.lessonId);
  await reconcileLessonProgress(block.lessonId);
  refresh(block.lessonId);
  return { ok: true };
}

/** Put a lesson's parts in a new order. `orderedIds` must be exactly its parts. */
export async function reorderBlocks(lessonId: string, orderedIds: string[]): Promise<Result> {
  await requireAdmin();
  const ids = z.array(z.string().max(40)).max(200).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };

  const current = await prisma.lessonBlock.findMany({ where: { lessonId }, select: { id: true } });
  const same = ids.data.length === current.length && new Set(ids.data).size === current.length && current.every((b) => ids.data.includes(b.id));
  if (!same) return { ok: false, error: "The lesson changed. Reload the page and try again." };

  await prisma.$transaction(ids.data.map((id, order) => prisma.lessonBlock.update({ where: { id }, data: { order } })));
  refresh(lessonId);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Uploads (video, audio, SCORM, web page, document) — browser → R2 directly
 * ------------------------------------------------------------------ */

const MB = 1024 * 1024;

/** Step 1: register the upload and hand back a presigned PUT URL. */
export async function createUpload(
  blockId: string,
  file: { name: string; type: string; size: number }
): Promise<Result<{ assetId: string; uploadUrl: string; contentType: string }>> {
  await requireAdmin();
  if (!isStorageConfigured()) {
    return { ok: false, error: "File storage (AWS S3) is not configured yet." };
  }
  const block = await prisma.lessonBlock.findUnique({ where: { id: blockId }, include: { asset: true } });
  if (!block || !isFileBlock(block.type)) return { ok: false, error: "Part not found." };

  const rule = UPLOAD_RULES[block.type];
  const type = String(file.type ?? "");
  const name = String(file.name ?? "").slice(0, 200);
  if (!rule.ext.test(name) || !rule.types.includes(type)) {
    return { ok: false, error: `Please upload ${rule.label}.` };
  }
  if (!(file.size > 0) || file.size > rule.max) {
    return { ok: false, error: `That file is too large (max ${Math.round(rule.max / MB)} MB).` };
  }

  const corsError = await ensureUploadCors(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").origin);
  if (corsError) return { ok: false, error: corsError };

  // Replacing content: remove the old asset and its files first.
  if (block.asset) {
    await prisma.contentAsset.delete({ where: { id: block.asset.id } });
    await removeAssetFiles([block.asset]);
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const contentType = type || "application/octet-stream";
  const asset = await prisma.contentAsset.create({
    data: {
      blockId,
      lessonId: block.lessonId,
      storageKey: `uploads/${randomUUID()}/${safeName}`,
      fileName: name,
      mimeType: contentType,
      sizeBytes: file.size <= 2_147_483_647 ? Math.round(file.size) : null,
    },
  });
  const uploadUrl = await presignUpload(asset.storageKey, contentType);
  refresh(block.lessonId);
  return { ok: true, assetId: asset.id, uploadUrl, contentType };
}

/**
 * Step 2: after the browser finished uploading — media and documents are ready,
 * packages get unpacked. With `detect`, a .zip in a web page part that turns
 * out to be a SCORM package becomes a SCORM part.
 */
export async function finalizeUpload(
  assetId: string,
  info: { durationSec?: number; detect?: boolean } = {}
): Promise<Result> {
  await requireAdmin();
  const asset = await prisma.contentAsset.findUnique({ where: { id: assetId }, include: { block: true } });
  if (!asset) return { ok: false, error: "Upload not found." };

  const { type } = asset.block;
  if (type === "VIDEO" || type === "AUDIO" || type === "DOCUMENT") {
    await prisma.contentAsset.update({ where: { id: assetId }, data: { status: "READY" } });
    const duration = Number(info.durationSec);
    if (type !== "DOCUMENT" && Number.isFinite(duration) && duration > 0 && duration < 24 * 3600) {
      await prisma.lessonBlock.update({ where: { id: asset.blockId }, data: { durationSec: Math.round(duration) } });
      await syncLesson(asset.lessonId);
    }
  } else {
    await ingestPackage(assetId, { detect: Boolean(info.detect) });
  }
  refresh(asset.lessonId);
  const fresh = await prisma.contentAsset.findUnique({ where: { id: assetId } });
  return fresh?.status === "FAILED" ? { ok: false, error: fresh.error ?? "Processing failed." } : { ok: true };
}

/** Remove a part's file but keep the part, ready for a new upload. */
export async function removeAsset(blockId: string): Promise<void> {
  await requireAdmin();
  const asset = await prisma.contentAsset.findUnique({ where: { blockId }, include: { block: { select: { type: true } } } });
  if (!asset) return;
  await prisma.contentAsset.delete({ where: { id: asset.id } });
  await removeAssetFiles([asset]);
  // A video's or recording's length came from its file.
  if (asset.block.type === "VIDEO" || asset.block.type === "AUDIO") {
    await prisma.lessonBlock.update({ where: { id: blockId }, data: { durationSec: null } });
    await syncLesson(asset.lessonId);
  }
  refresh(asset.lessonId);
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

  // The final assessment is a lesson of its own: it can't sit beside other parts.
  if (parsed.data.kind === "EXAM") {
    const others = await prisma.lessonBlock.count({ where: { lessonId, type: { not: "QUIZ" } } });
    if (others > 0) {
      return { error: "Only a lesson made of just the quiz can be the final assessment. Move the other parts to another lesson first." };
    }
  }
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

/** Draft questions with AI from the chosen lessons, then save them to this lesson's quiz. */
export async function generateQuestions(lessonId: string, input: unknown): Promise<Result<{ created: number }>> {
  await requireAdmin();
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { replace, ...options } = parsed.data;

  const hasQuizPart = await prisma.lessonBlock.count({ where: { lessonId, type: "QUIZ" } });
  if (!hasQuizPart) return { ok: false, error: "Lesson not found." };
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

