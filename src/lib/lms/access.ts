import "server-only";
import { prisma } from "@/lib/prisma";
import { isPrelaunch } from "@/lib/launch";
import type { SessionPayload } from "@/lib/auth";

/**
 * Access rules — the single place that decides who may open what.
 *
 *  1. A learner may open a course when they hold an ACTIVE enrolment in a tier
 *     that includes it, and the course and its program are published.
 *  2. If the course has a prerequisite, that course must be completed first.
 *  3. In a `sequential` course, each lesson opens only after the one before it.
 *
 * Admins can open everything (for previewing), published or not.
 */

/** IDs of every course unlocked by the user's ACTIVE enrolments. */
export async function getUnlockedCourseIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.tierCourse.findMany({
    where: { tier: { enrollments: { some: { userId, status: "ACTIVE" } } } },
    select: { courseId: true },
  });
  return new Set(rows.map((r) => r.courseId));
}

/** Published lessons of a course, in display order (module order, then lesson order). */
export async function getOrderedLessons(courseId: string, includeUnpublished = false) {
  return prisma.lesson.findMany({
    where: { module: { courseId }, ...(includeUnpublished ? {} : { published: true }) },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, type: true, moduleId: true },
  });
}

/** Which of the given courses the user has completed (every published lesson COMPLETED). */
export async function getCompletedCourseIds(
  userId: string,
  courseIds: string[]
): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set();
  const [totals, done] = await Promise.all([
    prisma.lesson.groupBy({
      by: ["moduleId"],
      where: { published: true, module: { courseId: { in: courseIds } } },
      _count: true,
    }),
    prisma.lessonProgress.findMany({
      where: {
        userId,
        status: "COMPLETED",
        lesson: { published: true, module: { courseId: { in: courseIds } } },
      },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    }),
  ]);
  const modules = await prisma.module.findMany({
    where: { id: { in: totals.map((t) => t.moduleId) } },
    select: { id: true, courseId: true },
  });
  const courseOf = new Map(modules.map((m) => [m.id, m.courseId]));

  const total = new Map<string, number>();
  for (const t of totals) {
    const c = courseOf.get(t.moduleId)!;
    total.set(c, (total.get(c) ?? 0) + t._count);
  }
  const completed = new Map<string, number>();
  for (const d of done) {
    const c = d.lesson.module.courseId;
    completed.set(c, (completed.get(c) ?? 0) + 1);
  }
  return new Set(
    courseIds.filter((id) => (total.get(id) ?? 0) > 0 && completed.get(id) === total.get(id))
  );
}

export type CourseLock = "OPEN" | "NOT_ENROLLED" | "PREREQUISITE";

/** Whether a learner can open a course, and if not, why. */
export async function getCourseLock(
  session: SessionPayload,
  course: { id: string; published: boolean; prerequisiteId: string | null; program: { published: boolean } }
): Promise<CourseLock> {
  if (session.role === "ADMIN") return "OPEN";
  if (!course.published || !course.program.published) return "NOT_ENROLLED";
  const unlocked = await getUnlockedCourseIds(session.userId);
  if (!unlocked.has(course.id)) return "NOT_ENROLLED";
  if (course.prerequisiteId) {
    const done = await getCompletedCourseIds(session.userId, [course.prerequisiteId]);
    if (!done.has(course.prerequisiteId)) return "PREREQUISITE";
  }
  return "OPEN";
}

export type LessonAccess =
  | {
      ok: true;
      lesson: NonNullable<Awaited<ReturnType<typeof loadLesson>>>;
    }
  | { ok: false; reason: "NOT_FOUND" | CourseLock | "SEQUENTIAL" | "PRELAUNCH" };

function loadLesson(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      asset: true,
      module: {
        include: {
          course: {
            include: { program: { select: { id: true, slug: true, title: true, published: true } } },
          },
        },
      },
    },
  });
}

/** Load a lesson and check the current user may open it. */
export async function checkLessonAccess(
  session: SessionPayload,
  lessonId: string
): Promise<LessonAccess> {
  const lesson = await loadLesson(lessonId);
  if (!lesson) return { ok: false, reason: "NOT_FOUND" };
  if (session.role === "ADMIN") return { ok: true, lesson };
  if (!lesson.published) return { ok: false, reason: "NOT_FOUND" };
  if (isPrelaunch()) return { ok: false, reason: "PRELAUNCH" };

  const course = lesson.module.course;
  const lock = await getCourseLock(session, course);
  if (lock !== "OPEN") return { ok: false, reason: lock };

  if (course.sequential) {
    const ordered = await getOrderedLessons(course.id);
    const index = ordered.findIndex((l) => l.id === lesson.id);
    const before = ordered.slice(0, Math.max(index, 0)).map((l) => l.id);
    if (before.length) {
      const done = await prisma.lessonProgress.count({
        where: { userId: session.userId, status: "COMPLETED", lessonId: { in: before } },
      });
      if (done < before.length) return { ok: false, reason: "SEQUENTIAL" };
    }
  }
  return { ok: true, lesson };
}

/** Lesson access for content served by ContentAsset id (SCORM/HTML files). */
export async function checkAssetAccess(session: SessionPayload, assetId: string) {
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    select: { lessonId: true },
  });
  if (!asset) return { ok: false as const, reason: "NOT_FOUND" as const };
  return checkLessonAccess(session, asset.lessonId);
}
