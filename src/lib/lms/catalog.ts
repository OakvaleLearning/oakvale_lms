import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { getCompletedModuleIds, getModuleLock, getUnlockedModuleIds, type ModuleLock } from "./access";
import { getModuleProgress } from "./progress";
import { absoluteCoverUrl } from "@/lib/storage";
import type { LessonKind } from "./blocks";

/** Learner home: enrolled programs → their unlocked modules with progress, plus "continue". */
export async function getLearnerHome(userId: string) {
  const unlocked = await getUnlockedModuleIds(userId);
  const modules = await prisma.module.findMany({
    where: { id: { in: [...unlocked] }, published: true, program: { published: true } },
    orderBy: [{ program: { order: "asc" } }, { order: "asc" }],
    include: {
      program: { select: { id: true, slug: true, title: true } },
      prerequisite: { select: { title: true } },
    },
  });

  const ids = modules.map((c) => c.id);
  const prereqIds = modules.flatMap((c) => (c.prerequisiteId ? [c.prerequisiteId] : []));
  const [progress, completedPrereqs, last] = await Promise.all([
    getModuleProgress(userId, ids),
    getCompletedModuleIds(userId, prereqIds),
    prisma.lessonProgress.findFirst({
      where: {
        userId,
        lesson: { published: true, topic: { moduleId: { in: ids } } },
      },
      // Prefer an unfinished lesson; fall back to the most recent one.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            topic: { select: { module: { select: { slug: true, title: true, program: { select: { slug: true } } } } } },
          },
        },
      },
    }),
  ]);

  const programs = new Map<string, { slug: string; title: string; modules: LearnerModuleCard[] }>();
  for (const c of modules) {
    const entry = programs.get(c.program.id) ?? { slug: c.program.slug, title: c.program.title, modules: [] };
    entry.modules.push({
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

  const mod = last?.lesson.topic.module;
  return {
    programs: [...programs.values()],
    continueLesson:
      last && mod
        ? {
            href: `/learn/${mod.program.slug}/${mod.slug}/${last.lesson.id}`,
            lessonId: last.lesson.id,
            programSlug: mod.program.slug,
            moduleSlug: mod.slug,
            lessonTitle: last.lesson.title,
            moduleTitle: mod.title,
          }
        : null,
  };
}

export interface LearnerModuleCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  progress: { completed: number; total: number; percent: number };
  lock: ModuleLock;
  prerequisiteTitle: string | null;
}

/** A module by its program + module slug, with lock state for the current user. */
export async function getModuleBySlugs(session: SessionPayload, programSlug: string, moduleSlug: string) {
  const mod = await prisma.module.findFirst({
    where: { slug: moduleSlug, program: { slug: programSlug } },
    include: {
      program: { select: { id: true, slug: true, title: true, published: true } },
      prerequisite: { select: { title: true, slug: true } },
    },
  });
  if (!mod) return null;
  const lock = await getModuleLock(session, mod);
  return { module: mod, lock };
}

export interface OutlineLesson {
  id: string;
  title: string;
  type: LessonKind;
  durationSec: number | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  locked: boolean;
  /** Final assessment: listed last, open once every other lesson is complete. */
  exam: boolean;
}

/**
 * Topics and lessons with per-lesson status; sequential modules lock lessons
 * after the first incomplete one. Final assessments are gathered into a last
 * "Final assessment" section, locked until every other lesson is complete.
 */
export async function getModuleOutline(userId: string, moduleId: string, opts: { sequential: boolean; isAdmin: boolean }) {
  const topics = await prisma.topic.findMany({
    where: { moduleId },
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
          quiz: { select: { kind: true } },
          progress: { where: { userId }, select: { status: true } },
        },
      },
    },
  });

  type Row = (typeof topics)[number]["lessons"][number];
  const isExam = (l: Row) => l.quiz?.kind === "EXAM";
  const row = (l: Row, locked: boolean): OutlineLesson => ({
    id: l.id,
    title: l.title,
    type: l.type,
    durationSec: l.durationSec,
    status: l.progress[0]?.status ?? "NOT_STARTED",
    locked,
    exam: isExam(l),
  });

  let blocked = false;
  const outline = topics
    .map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.filter((l) => !isExam(l)).map((l) => {
        const lesson = row(l, opts.sequential && !opts.isAdmin && blocked);
        if (lesson.status !== "COMPLETED") blocked = true;
        return lesson;
      }),
    }))
    .filter((m) => m.lessons.length > 0 || opts.isAdmin);

  const exams = topics.flatMap((m) => m.lessons.filter(isExam));
  if (exams.length) {
    outline.push({ id: "final-assessment", title: "Final assessment", lessons: exams.map((l) => row(l, !opts.isAdmin && blocked)) });
  }
  return outline;
}
