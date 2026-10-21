import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { getCompletedCourseIds, getCourseLock, getUnlockedCourseIds, type CourseLock } from "./access";
import { getCourseProgress } from "./progress";
import { absoluteCoverUrl } from "@/lib/storage";

/** Learner home: enrolled programs → their unlocked courses with progress, plus "continue". */
export async function getLearnerHome(userId: string) {
  const unlocked = await getUnlockedCourseIds(userId);
  const courses = await prisma.course.findMany({
    where: { id: { in: [...unlocked] }, published: true, program: { published: true } },
    orderBy: [{ program: { order: "asc" } }, { order: "asc" }],
    include: {
      program: { select: { id: true, slug: true, title: true } },
      prerequisite: { select: { title: true } },
    },
  });

  const ids = courses.map((c) => c.id);
  const prereqIds = courses.flatMap((c) => (c.prerequisiteId ? [c.prerequisiteId] : []));
  const [progress, completedPrereqs, last] = await Promise.all([
    getCourseProgress(userId, ids),
    getCompletedCourseIds(userId, prereqIds),
    prisma.lessonProgress.findFirst({
      where: {
        userId,
        lesson: { published: true, module: { courseId: { in: ids } } },
      },
      // Prefer an unfinished lesson; fall back to the most recent one.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            module: { select: { course: { select: { slug: true, title: true, program: { select: { slug: true } } } } } },
          },
        },
      },
    }),
  ]);

  const programs = new Map<string, { slug: string; title: string; courses: LearnerCourseCard[] }>();
  for (const c of courses) {
    const entry = programs.get(c.program.id) ?? { slug: c.program.slug, title: c.program.title, courses: [] };
    entry.courses.push({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      coverImage: absoluteCoverUrl(c.coverImage),
      progress: progress.get(c.id)!,
      lock: c.prerequisiteId && !completedPrereqs.has(c.prerequisiteId) ? "PREREQUISITE" : "OPEN",
      prerequisiteTitle: c.prerequisite?.title ?? null,
    });
    programs.set(c.program.id, entry);
  }

  const course = last?.lesson.module.course;
  return {
    programs: [...programs.values()],
    continueLesson:
      last && course
        ? {
            href: `/learn/${course.program.slug}/${course.slug}/${last.lesson.id}`,
            lessonId: last.lesson.id,
            programSlug: course.program.slug,
            courseSlug: course.slug,
            lessonTitle: last.lesson.title,
            courseTitle: course.title,
          }
        : null,
  };
}

export interface LearnerCourseCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  progress: { completed: number; total: number; percent: number };
  lock: CourseLock;
  prerequisiteTitle: string | null;
}

/** A course by its program + course slug, with lock state for the current user. */
export async function getCourseBySlugs(session: SessionPayload, programSlug: string, courseSlug: string) {
  const course = await prisma.course.findFirst({
    where: { slug: courseSlug, program: { slug: programSlug } },
    include: {
      program: { select: { id: true, slug: true, title: true, published: true } },
      prerequisite: { select: { title: true, slug: true } },
    },
  });
  if (!course) return null;
  const lock = await getCourseLock(session, course);
  return { course, lock };
}

export interface OutlineLesson {
  id: string;
  title: string;
  type: "SCORM" | "HTML" | "VIDEO" | "AUDIO" | "QUIZ";
  durationSec: number | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  locked: boolean;
}

/** Modules and lessons with per-lesson status; sequential courses lock lessons after the first incomplete one. */
export async function getCourseOutline(userId: string, courseId: string, opts: { sequential: boolean; isAdmin: boolean }) {
  const modules = await prisma.module.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      lessons: {
        where: opts.isAdmin ? {} : { published: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          type: true,
          durationSec: true,
          progress: { where: { userId }, select: { status: true } },
        },
      },
    },
  });

  let blocked = false;
  return modules
    .map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l): OutlineLesson => {
        const status = l.progress[0]?.status ?? "NOT_STARTED";
        const locked = opts.sequential && !opts.isAdmin && blocked;
        if (status !== "COMPLETED") blocked = true;
        return { id: l.id, title: l.title, type: l.type, durationSec: l.durationSec, status, locked };
      }),
    }))
    .filter((m) => m.lessons.length > 0 || opts.isAdmin);
}
