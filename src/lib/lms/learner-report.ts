import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Admin reporting on one learner, or a page of learners: who is active,
 * where each one is, and how long modules, topics and lessons took.
 *
 * A learner is *active* once they hold an ACTIVE enrolment: paid through
 * checkout, or granted by an admin. Registered learners with no active
 * enrolment (never paid, checkout pending, or cancelled) are *not active*.
 *
 * Times:
 *  - started   = when the lesson was first opened (LessonProgress.createdAt)
 *  - completed = LessonProgress.completedAt
 *  - elapsed   = completed − started (calendar time, breaks included)
 *  - time spent = LessonProgress.timeSpentSec, active time on the web lesson
 *    page (counted from November 2026; not reported by the mobile app)
 * A topic or module is complete once every required published lesson in it
 * is, at the latest of those lessons' completion times.
 */

export const activeLearnerWhere = { enrollments: { some: { status: "ACTIVE" } } } satisfies Prisma.UserWhereInput;
export const inactiveLearnerWhere = { enrollments: { none: { status: "ACTIVE" } } } satisfies Prisma.UserWhereInput;

export type CurrentPoint = {
  userId: string;
  lessonId: string;
  lessonTitle: string;
  topicTitle: string;
  moduleId: string;
  moduleTitle: string;
  status: "IN_PROGRESS" | "COMPLETED";
  at: Date;
};

/** Each learner's most recent lesson activity (the lesson they're on), by user id. */
export async function getCurrentPoints(userIds: string[]): Promise<Map<string, CurrentPoint>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<CurrentPoint[]>`
    SELECT DISTINCT ON (lp."userId")
      lp."userId", lp."lessonId", l."title" AS "lessonTitle", t."title" AS "topicTitle",
      m."id" AS "moduleId", m."title" AS "moduleTitle", lp."status"::text AS "status", lp."updatedAt" AS "at"
    FROM "LessonProgress" lp
    JOIN "Lesson" l ON l."id" = lp."lessonId"
    JOIN "Topic" t ON t."id" = l."topicId"
    JOIN "Module" m ON m."id" = t."moduleId"
    WHERE lp."userId" IN (${Prisma.join(userIds)})
    ORDER BY lp."userId", lp."updatedAt" DESC`;
  return new Map(rows.map((r) => [r.userId, r]));
}

export type LessonRecord = {
  id: string;
  title: string;
  kind: "LESSON" | "QUIZ" | "EXAM";
  /** Optional final assessments don't count towards completion. */
  required: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  startedAt: Date | null;
  completedAt: Date | null;
  elapsedSec: number | null;
  timeSpentSec: number;
  score: number | null;
  lastActivityAt: Date | null;
};

type Rollup = {
  lessons: number;
  completed: number;
  percent: number;
  startedAt: Date | null;
  completedAt: Date | null;
  elapsedSec: number | null;
  timeSpentSec: number;
};

export type TopicRecord = Rollup & { id: string; title: string; lessonList: LessonRecord[] };
export type ModuleRecord = Rollup & {
  id: string;
  title: string;
  programTitle: string;
  topics: TopicRecord[];
  /** Where the learner is in this module: their latest unfinished lesson, else the next one to do. */
  nextLesson: { id: string; title: string; topicTitle: string; status: LessonRecord["status"] } | null;
};

function rollup(lessons: LessonRecord[]): Rollup {
  const required = lessons.filter((l) => l.required);
  const completed = required.filter((l) => l.status === "COMPLETED").length;
  const started = lessons.map((l) => l.startedAt).filter((d): d is Date => d !== null);
  const startedAt = started.length ? new Date(Math.min(...started.map((d) => d.getTime()))) : null;
  const done = required.length > 0 && completed === required.length;
  const completedAt = done ? new Date(Math.max(...required.map((l) => l.completedAt!.getTime()))) : null;
  return {
    lessons: required.length,
    completed,
    percent: required.length ? Math.round((completed / required.length) * 100) : 0,
    startedAt,
    completedAt,
    elapsedSec: startedAt && completedAt ? Math.max(0, (completedAt.getTime() - startedAt.getTime()) / 1000) : null,
    timeSpentSec: lessons.reduce((sum, l) => sum + l.timeSpentSec, 0),
  };
}

/**
 * The learner's record for each module, in programme and module order: every
 * topic and published lesson with start, completion, elapsed and active time.
 */
export async function getLearningRecord(userId: string, moduleIds: string[]): Promise<ModuleRecord[]> {
  if (moduleIds.length === 0) return [];
  const modules = await prisma.module.findMany({
    where: { id: { in: moduleIds } },
    orderBy: [{ program: { order: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      title: true,
      program: { select: { title: true } },
      topics: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          lessons: {
            where: { published: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              quiz: { select: { kind: true, optional: true } },
              progress: {
                where: { userId },
                select: { status: true, createdAt: true, completedAt: true, updatedAt: true, timeSpentSec: true, score: true },
              },
            },
          },
        },
      },
    },
  });

  return modules.map((mod) => {
    const topics: TopicRecord[] = mod.topics.map((topic) => {
      const lessonList = topic.lessons.map((l): LessonRecord => {
        const p = l.progress[0];
        const completedAt = p?.status === "COMPLETED" ? (p.completedAt ?? p.updatedAt) : null;
        return {
          id: l.id,
          title: l.title,
          kind: l.quiz?.kind === "EXAM" ? "EXAM" : l.quiz ? "QUIZ" : "LESSON",
          required: !(l.quiz?.kind === "EXAM" && l.quiz.optional),
          status: p?.status ?? "NOT_STARTED",
          startedAt: p?.createdAt ?? null,
          completedAt,
          elapsedSec: p && completedAt ? Math.max(0, (completedAt.getTime() - p.createdAt.getTime()) / 1000) : null,
          timeSpentSec: p?.timeSpentSec ?? 0,
          score: p?.score ?? null,
          lastActivityAt: p?.updatedAt ?? null,
        };
      });
      return { id: topic.id, title: topic.title, lessonList, ...rollup(lessonList) };
    });

    // Final assessments come last in the module, whichever topic holds them (as learners see it).
    const flat = topics.flatMap((t) => t.lessonList.map((l) => ({ ...l, topicTitle: t.title })));
    const ordered = [...flat.filter((l) => l.kind !== "EXAM"), ...flat.filter((l) => l.kind === "EXAM")];
    const latestOpen = ordered
      .filter((l) => l.status === "IN_PROGRESS")
      .sort((a, b) => b.lastActivityAt!.getTime() - a.lastActivityAt!.getTime())[0];
    const next = latestOpen ?? ordered.find((l) => l.required && l.status !== "COMPLETED") ?? null;

    return {
      id: mod.id,
      title: mod.title,
      programTitle: mod.program.title,
      topics,
      nextLesson: next && { id: next.id, title: next.title, topicTitle: next.topicTitle, status: next.status },
      ...rollup(topics.flatMap((t) => t.lessonList)),
    };
  });
}

/** Every module the learner has an active enrolment in, plus any they have progress in (e.g. from a cancelled enrolment). */
export async function getRecordModuleIds(userId: string, activeTierModuleIds: Iterable<string>): Promise<string[]> {
  const touched = await prisma.module.findMany({
    where: { topics: { some: { lessons: { some: { progress: { some: { userId } } } } } } },
    select: { id: true },
  });
  return [...new Set([...activeTierModuleIds, ...touched.map((m) => m.id)])];
}
