import "server-only";
import { prisma } from "@/lib/prisma";
import { checkCertificateAfterLesson } from "./certificates";

export interface ProgressUpdate {
  /** Resume point for video/audio, in seconds. */
  positionSec?: number;
  /** Mark the part (or, in a lesson without parts, the lesson) completed. Completion is never undone. */
  completed?: boolean;
  /** Score in percent; the best score is kept. */
  score?: number;
  /** Which part of the lesson this is about. Optional when the lesson has a single part. */
  blockId?: string;
}

/** The update names no part, and the lesson has several. */
export class PartRequiredError extends Error {
  constructor() {
    super("This lesson has several parts; say which one.");
  }
}

/** The named part isn't in this lesson. */
export class UnknownPartError extends Error {
  constructor() {
    super("That part isn't in this lesson.");
  }
}

/**
 * Record a learner's progress on a lesson part, then bring the lesson's own
 * progress in line. Safe to call repeatedly and out of order (heartbeats,
 * retries, offline replays): a COMPLETED part or lesson stays completed and the
 * best score wins.
 *
 * A lesson is complete once every required part is. (If none is required, once
 * any part is.) A lesson that was completed stays completed even if a part is
 * added to it later. Its score is the quiz's score when it has a quiz,
 * otherwise the best score any part reported (e.g. a SCORM package).
 */
export async function recordProgress(userId: string, lessonId: string, update: ProgressUpdate) {
  const blocks = await prisma.lessonBlock.findMany({
    where: { lessonId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true, required: true },
  });

  // A lesson with no parts (empty, or from before parts existed) is tracked as a whole.
  const target = update.blockId
    ? blocks.find((b) => b.id === update.blockId)
    : blocks.length === 1
      ? blocks[0]
      : undefined;
  if (blocks.length > 0 && !target) throw update.blockId ? new UnknownPartError() : new PartRequiredError();

  const { saved, certify } = await prisma.$transaction(async (tx) => {
    // Serialise updates for one learner on one lesson, so two parts finishing at
    // the same moment can't each miss the other's completion.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`progress:${userId}:${lessonId}`}))`;

    if (target) {
      const existingPart = await tx.blockProgress.findUnique({
        where: { userId_blockId: { userId, blockId: target.id } },
      });
      const done = existingPart?.status === "COMPLETED" || Boolean(update.completed);
      const part = {
        status: done ? ("COMPLETED" as const) : ("IN_PROGRESS" as const),
        positionSec:
          update.positionSec === undefined
            ? (existingPart?.positionSec ?? null)
            : Math.max(0, Math.floor(update.positionSec)),
        score:
          update.score === undefined
            ? (existingPart?.score ?? null)
            : Math.max(existingPart?.score ?? 0, Math.round(update.score)),
        completedAt: existingPart?.completedAt ?? (done ? new Date() : null),
      };
      await tx.blockProgress.upsert({
        where: { userId_blockId: { userId, blockId: target.id } },
        update: part,
        create: { userId, blockId: target.id, ...part },
      });
    }

    const existing = await tx.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });

    let completed: boolean;
    let score: number | null;
    if (blocks.length === 0) {
      completed = existing?.status === "COMPLETED" || Boolean(update.completed);
      score =
        update.score === undefined ? (existing?.score ?? null) : Math.max(existing?.score ?? 0, Math.round(update.score));
    } else {
      const parts = new Map(
        (
          await tx.blockProgress.findMany({
            where: { userId, blockId: { in: blocks.map((b) => b.id) } },
            select: { blockId: true, status: true, score: true },
          })
        ).map((p) => [p.blockId, p])
      );
      const isDone = (id: string) => parts.get(id)?.status === "COMPLETED";
      const required = blocks.filter((b) => b.required);
      const finished = required.length ? required.every((b) => isDone(b.id)) : blocks.some((b) => isDone(b.id));
      completed = existing?.status === "COMPLETED" || finished;

      const quiz = blocks.find((b) => b.type === "QUIZ");
      if (quiz) {
        score = parts.get(quiz.id)?.score ?? null;
      } else {
        const scores = blocks.map((b) => parts.get(b.id)?.score).filter((s): s is number => typeof s === "number");
        score = scores.length || existing?.score != null ? Math.max(existing?.score ?? 0, ...scores) : null;
      }
    }

    // Resume points are per part; the lesson keeps one only when it has a single part (older mobile apps read it).
    const positionSec =
      blocks.length <= 1 && update.positionSec !== undefined
        ? Math.max(0, Math.floor(update.positionSec))
        : (existing?.positionSec ?? null);

    const data = {
      status: completed ? ("COMPLETED" as const) : ("IN_PROGRESS" as const),
      positionSec,
      score,
      completedAt: existing?.completedAt ?? (completed ? new Date() : null),
    };
    const saved = await tx.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: data,
      create: { userId, lessonId, ...data },
    });
    // Finishing a lesson, or raising a quiz score, may complete the course certificate.
    const certify = completed && (existing?.status !== "COMPLETED" || (score ?? 0) > (existing?.score ?? 0));
    return { saved, certify };
  });

  if (certify) await checkCertificateAfterLesson(userId, lessonId);
  return saved;
}

/**
 * After parts are removed or made optional, learners who have now done every
 * required part (and were waiting on the one that went away) are marked
 * complete. Completed lessons are never un-completed, so nothing else changes.
 */
export async function reconcileLessonProgress(lessonId: string): Promise<void> {
  const blocks = await prisma.lessonBlock.findMany({
    where: { lessonId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, required: true },
  });
  if (blocks.length === 0) return;
  const required = blocks.filter((b) => b.required);
  const needed = required.length || 1;
  const finished = await prisma.blockProgress.groupBy({
    by: ["userId"],
    where: { blockId: { in: (required.length ? required : blocks).map((b) => b.id) }, status: "COMPLETED" },
    _count: { _all: true },
  });
  const userIds = finished.filter((f) => f._count._all >= needed).map((f) => f.userId);
  if (userIds.length === 0) return;
  const already = new Set(
    (
      await prisma.lessonProgress.findMany({
        where: { lessonId, userId: { in: userIds }, status: "COMPLETED" },
        select: { userId: true },
      })
    ).map((p) => p.userId)
  );
  for (const userId of userIds.filter((u) => !already.has(u))) {
    // No new completion is claimed: this just recomputes the lesson from its parts.
    await recordProgress(userId, lessonId, { blockId: blocks[0].id });
  }
}

/** A learner's progress on each part of a lesson, by part id. */
export async function getBlockProgress(userId: string, lessonId: string) {
  const rows = await prisma.blockProgress.findMany({
    where: { userId, block: { lessonId } },
    select: { blockId: true, status: true, positionSec: true, score: true },
  });
  return new Map(rows.map((r) => [r.blockId, r]));
}

/** Completed / total published lessons for each course, for progress bars. */
export async function getCourseProgress(userId: string, courseIds: string[]) {
  const result = new Map<string, { completed: number; total: number; percent: number }>();
  if (courseIds.length === 0) return result;

  const lessons = await prisma.lesson.findMany({
    where: { published: true, module: { courseId: { in: courseIds } } },
    select: {
      module: { select: { courseId: true } },
      progress: { where: { userId, status: "COMPLETED" }, select: { lessonId: true } },
    },
  });
  for (const id of courseIds) result.set(id, { completed: 0, total: 0, percent: 0 });
  for (const l of lessons) {
    const r = result.get(l.module.courseId)!;
    r.total += 1;
    if (l.progress.length) r.completed += 1;
  }
  for (const r of result.values()) {
    r.percent = r.total ? Math.round((r.completed / r.total) * 100) : 0;
  }
  return result;
}
