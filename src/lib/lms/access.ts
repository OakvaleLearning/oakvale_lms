import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPrelaunch } from "@/lib/launch";
import { isEmailVerified, type SessionPayload } from "@/lib/auth";

/**
 * Access rules — the single place that decides who may open what.
 *
 *  1. A learner may open a module when they hold an ACTIVE enrolment in a tier
 *     that includes it, and the module and its program are published.
 *  2. If the module has a prerequisite, that module must be completed first.
 *  3. In a `sequential` module, each lesson opens only after the one before it.
 *  0. Learners must have confirmed their email before opening any lesson.
 *  4. A final assessment (an EXAM quiz) comes after every other lesson and
 *     opens once they are all completed. An optional one can be skipped: it
 *     doesn't count towards completing the module.
 *
 * Admins can open everything (for previewing), published or not.
 */

/** IDs of every module unlocked by the user's ACTIVE enrolments. */
export async function getUnlockedModuleIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.tierModule.findMany({
    where: { tier: { enrollments: { some: { userId, status: "ACTIVE" } } } },
    select: { moduleId: true },
  });
  return new Set(rows.map((r) => r.moduleId));
}

/** Published lessons of a module, in display order (topic order, then lesson order, final assessments last). */
export async function getOrderedLessons(moduleId: string, includeUnpublished = false) {
  const lessons = await prisma.lesson.findMany({
    where: { topic: { moduleId }, ...(includeUnpublished ? {} : { published: true }) },
    orderBy: [{ topic: { order: "asc" } }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, type: true, topicId: true, quiz: { select: { kind: true } } },
  });
  return [...lessons.filter((l) => l.quiz?.kind !== "EXAM"), ...lessons.filter((l) => l.quiz?.kind === "EXAM")];
}

/** Lessons a learner must complete to finish a module: everything except optional final assessments. */
export const requiredLesson = {
  NOT: { quiz: { is: { kind: "EXAM", optional: true } } },
} satisfies Prisma.LessonWhereInput;

/** Which of the given modules the user has completed (every required published lesson COMPLETED). */
export async function getCompletedModuleIds(
  userId: string,
  moduleIds: string[]
): Promise<Set<string>> {
  if (moduleIds.length === 0) return new Set();
  const [totals, done] = await Promise.all([
    prisma.lesson.groupBy({
      by: ["topicId"],
      where: { published: true, topic: { moduleId: { in: moduleIds } }, ...requiredLesson },
      _count: true,
    }),
    prisma.lessonProgress.findMany({
      where: {
        userId,
        status: "COMPLETED",
        lesson: { published: true, topic: { moduleId: { in: moduleIds } }, ...requiredLesson },
      },
      select: { lesson: { select: { topic: { select: { moduleId: true } } } } },
    }),
  ]);
  const topics = await prisma.topic.findMany({
    where: { id: { in: totals.map((t) => t.topicId) } },
    select: { id: true, moduleId: true },
  });
  const moduleOf = new Map(topics.map((m) => [m.id, m.moduleId]));

  const total = new Map<string, number>();
  for (const t of totals) {
    const c = moduleOf.get(t.topicId)!;
    total.set(c, (total.get(c) ?? 0) + t._count);
  }
  const completed = new Map<string, number>();
  for (const d of done) {
    const c = d.lesson.topic.moduleId;
    completed.set(c, (completed.get(c) ?? 0) + 1);
  }
  return new Set(
    moduleIds.filter((id) => (total.get(id) ?? 0) > 0 && completed.get(id) === total.get(id))
  );
}

export type ModuleLock = "OPEN" | "NOT_ENROLLED" | "PREREQUISITE";

/** Whether a learner can open a module, and if not, why. */
export async function getModuleLock(
  session: SessionPayload,
  mod: { id: string; published: boolean; prerequisiteId: string | null; program: { published: boolean } }
): Promise<ModuleLock> {
  if (session.role === "ADMIN") return "OPEN";
  if (!mod.published || !mod.program.published) return "NOT_ENROLLED";
  const unlocked = await getUnlockedModuleIds(session.userId);
  if (!unlocked.has(mod.id)) return "NOT_ENROLLED";
  if (mod.prerequisiteId) {
    const done = await getCompletedModuleIds(session.userId, [mod.prerequisiteId]);
    if (!done.has(mod.prerequisiteId)) return "PREREQUISITE";
  }
  return "OPEN";
}

export type LessonAccess =
  | {
      ok: true;
      lesson: NonNullable<Awaited<ReturnType<typeof loadLesson>>>;
    }
  | { ok: false; reason: "NOT_FOUND" | ModuleLock | "SEQUENTIAL" | "EXAM_LOCKED" | "PRELAUNCH" | "UNVERIFIED" };

function loadLesson(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      // The lesson's parts, in the order learners meet them.
      blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { asset: true } },
      quiz: { select: { kind: true } },
      topic: {
        include: {
          module: {
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
  if (!(await isEmailVerified(session.userId))) return { ok: false, reason: "UNVERIFIED" };

  const mod = lesson.topic.module;
  const lock = await getModuleLock(session, mod);
  if (lock !== "OPEN") return { ok: false, reason: lock };

  if (lesson.quiz?.kind === "EXAM") {
    const others = await getOrderedLessons(mod.id).then((all) => all.filter((l) => l.quiz?.kind !== "EXAM").map((l) => l.id));
    const done = await prisma.lessonProgress.count({
      where: { userId: session.userId, status: "COMPLETED", lessonId: { in: others } },
    });
    if (done < others.length) return { ok: false, reason: "EXAM_LOCKED" };
  } else if (mod.sequential) {
    const ordered = await getOrderedLessons(mod.id);
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
