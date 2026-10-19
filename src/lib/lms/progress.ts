import "server-only";
import { prisma } from "@/lib/prisma";

export interface ProgressUpdate {
  /** Resume point for video/audio, in seconds. */
  positionSec?: number;
  /** Mark the lesson completed. Completion is never undone. */
  completed?: boolean;
  /** Score in percent; the best score is kept. */
  score?: number;
}

/**
 * Record a learner's progress on a lesson. Safe to call repeatedly and out of
 * order (heartbeats, retries, offline replays): a COMPLETED lesson stays
 * completed and the best score wins.
 */
export async function recordProgress(userId: string, lessonId: string, update: ProgressUpdate) {
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });

  const completed = existing?.status === "COMPLETED" || Boolean(update.completed);
  const score =
    update.score === undefined
      ? existing?.score ?? null
      : Math.max(existing?.score ?? 0, Math.round(update.score));
  const positionSec =
    update.positionSec === undefined
      ? existing?.positionSec ?? null
      : Math.max(0, Math.floor(update.positionSec));

  const data = {
    status: completed ? ("COMPLETED" as const) : ("IN_PROGRESS" as const),
    positionSec,
    score,
    completedAt: existing?.completedAt ?? (completed ? new Date() : null),
  };

  return prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: data,
    create: { userId, lessonId, ...data },
  });
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
