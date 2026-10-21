"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { removeAssetFiles } from "@/lib/lms/packages";
import {
  courseSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  programSchema,
  tierSchema,
} from "@/lib/validation";

/**
 * Catalogue management: programs, tiers, courses, modules, lessons.
 * Every action re-checks the admin session; pages only render forms.
 */

export type ActionState = { error?: string; ok?: boolean } | undefined;

const bool = (fd: FormData, name: string) => fd.get(name) === "on";
const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Invalid input";
const isUniqueError = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/learn", "layout");
}

async function nextOrder(count: Promise<{ _max: { order: number | null } }>) {
  return ((await count)._max.order ?? -1) + 1;
}

/* ------------------------------------------------------------------ *
 * Programs
 * ------------------------------------------------------------------ */

function parseProgram(fd: FormData) {
  return programSchema.safeParse({
    title: text(fd, "title"),
    slug: text(fd, "slug"),
    description: text(fd, "description"),
    published: bool(fd, "published"),
  });
}

export async function createProgram(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseProgram(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    const order = await nextOrder(prisma.program.aggregate({ _max: { order: true } }));
    const program = await prisma.program.create({
      data: { ...parsed.data, order },
    });
    id = program.id;
  } catch (err) {
    if (isUniqueError(err)) return { error: "A programme with that slug already exists." };
    throw err;
  }
  refresh();
  redirect(`/admin/programs/${id}`);
}

export async function updateProgram(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseProgram(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await prisma.program.update({
      where: { id },
      data: parsed.data,
    });
  } catch (err) {
    if (isUniqueError(err)) return { error: "A programme with that slug already exists." };
    throw err;
  }
  refresh();
  return { ok: true };
}

export async function deleteProgram(id: string): Promise<ActionState> {
  await requireAdmin();
  const enrolments = await prisma.enrollment.count({ where: { tier: { programId: id } } });
  if (enrolments > 0) {
    return { error: "Learners are enrolled in this programme. Unpublish it instead of deleting." };
  }
  const assets = await prisma.contentAsset.findMany({
    where: { lesson: { module: { course: { programId: id } } } },
    select: { id: true, storageKey: true },
  });
  await prisma.program.delete({ where: { id } });
  await removeAssetFiles(assets);
  refresh();
  redirect("/admin/programs");
}

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

function parseTier(fd: FormData) {
  return tierSchema.safeParse({
    name: text(fd, "name"),
    slug: text(fd, "slug"),
    description: text(fd, "description"),
    priceNaira: text(fd, "priceNaira"),
    published: bool(fd, "published"),
    courseIds: fd.getAll("courseIds").map(String),
  });
}

/** Only courses of the same program may be attached to a tier. */
async function ownCourseIds(programId: string, ids: string[]) {
  const rows = await prisma.course.findMany({ where: { programId, id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function createTier(programId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseTier(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { priceNaira, courseIds, ...data } = parsed.data;
  try {
    const order = await nextOrder(prisma.tier.aggregate({ where: { programId }, _max: { order: true } }));
    const courses = await ownCourseIds(programId, courseIds);
    await prisma.tier.create({
      data: {
        ...data,
        programId,
        order,
        price: priceNaira * 100,
        courses: { create: courses.map((courseId) => ({ courseId })) },
      },
    });
  } catch (err) {
    if (isUniqueError(err)) return { error: "This programme already has a tier with that slug." };
    throw err;
  }
  refresh();
  return { ok: true };
}

export async function updateTier(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseTier(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { priceNaira, courseIds, ...data } = parsed.data;
  const tier = await prisma.tier.findUniqueOrThrow({ where: { id }, select: { programId: true } });
  const courses = await ownCourseIds(tier.programId, courseIds);
  try {
    await prisma.$transaction([
      prisma.tierCourse.deleteMany({ where: { tierId: id } }),
      prisma.tier.update({
        where: { id },
        data: { ...data, price: priceNaira * 100, courses: { create: courses.map((courseId) => ({ courseId })) } },
      }),
    ]);
  } catch (err) {
    if (isUniqueError(err)) return { error: "This programme already has a tier with that slug." };
    throw err;
  }
  refresh();
  return { ok: true };
}

export async function deleteTier(id: string): Promise<ActionState> {
  await requireAdmin();
  if ((await prisma.enrollment.count({ where: { tierId: id } })) > 0) {
    return { error: "Learners have bought this tier. Unpublish it instead of deleting." };
  }
  await prisma.tier.delete({ where: { id } });
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

function parseCourse(fd: FormData) {
  return courseSchema.safeParse({
    title: text(fd, "title"),
    slug: text(fd, "slug"),
    description: text(fd, "description"),
    published: bool(fd, "published"),
    sequential: bool(fd, "sequential"),
    prerequisiteId: text(fd, "prerequisiteId"),
  });
}

export async function createCourse(programId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseCourse(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    const order = await nextOrder(prisma.course.aggregate({ where: { programId }, _max: { order: true } }));
    const { prerequisiteId, ...data } = parsed.data;
    const prereq = prerequisiteId
      ? await prisma.course.findFirst({ where: { id: prerequisiteId, programId }, select: { id: true } })
      : null;
    const course = await prisma.course.create({
      data: { ...data, programId, order, prerequisiteId: prereq?.id ?? null },
    });
    id = course.id;
  } catch (err) {
    if (isUniqueError(err)) return { error: "This programme already has a course with that slug." };
    throw err;
  }
  refresh();
  redirect(`/admin/courses/${id}`);
}

export async function updateCourse(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseCourse(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { prerequisiteId, ...data } = parsed.data;
  const course = await prisma.course.findUniqueOrThrow({ where: { id }, select: { programId: true } });

  let prereq: string | null = null;
  if (prerequisiteId) {
    // Walk the chain to make sure we don't create a cycle (A needs B needs A).
    let cursor: string | null = prerequisiteId;
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === id) return { error: "That prerequisite would create a loop." };
      const row: { programId: string; prerequisiteId: string | null } | null = await prisma.course.findUnique({
        where: { id: cursor },
        select: { programId: true, prerequisiteId: true },
      });
      if (!row || row.programId !== course.programId) return { error: "Invalid prerequisite." };
      cursor = row.prerequisiteId;
    }
    prereq = prerequisiteId;
  }

  try {
    await prisma.course.update({
      where: { id },
      data: { ...data, prerequisiteId: prereq },
    });
  } catch (err) {
    if (isUniqueError(err)) return { error: "This programme already has a course with that slug." };
    throw err;
  }
  refresh();
  return { ok: true };
}

export async function deleteCourse(id: string): Promise<ActionState> {
  await requireAdmin();
  const course = await prisma.course.findUniqueOrThrow({ where: { id }, select: { programId: true } });
  const assets = await prisma.contentAsset.findMany({
    where: { lesson: { module: { courseId: id } } },
    select: { id: true, storageKey: true },
  });
  await prisma.course.delete({ where: { id } });
  await removeAssetFiles(assets);
  refresh();
  redirect(`/admin/programs/${course.programId}`);
}

/* ------------------------------------------------------------------ *
 * Modules
 * ------------------------------------------------------------------ */

export async function createModule(courseId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const title = text(fd, "title").trim();
  if (title.length < 2 || title.length > 200) return { error: "Give the module a title." };
  const order = await nextOrder(prisma.module.aggregate({ where: { courseId }, _max: { order: true } }));
  await prisma.module.create({ data: { courseId, title, order } });
  refresh();
  return { ok: true };
}

export async function renameModule(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const title = text(fd, "title").trim();
  if (title.length < 2 || title.length > 200) return { error: "Give the module a title." };
  await prisma.module.update({ where: { id }, data: { title } });
  refresh();
  return { ok: true };
}

export async function deleteModule(id: string): Promise<ActionState> {
  await requireAdmin();
  const assets = await prisma.contentAsset.findMany({
    where: { lesson: { moduleId: id } },
    select: { id: true, storageKey: true },
  });
  await prisma.module.delete({ where: { id } });
  await removeAssetFiles(assets);
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Lessons
 * ------------------------------------------------------------------ */

export async function createLesson(moduleId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = lessonCreateSchema.safeParse({ title: text(fd, "title"), type: text(fd, "type") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const order = await nextOrder(prisma.lesson.aggregate({ where: { moduleId }, _max: { order: true } }));
  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      order,
      ...parsed.data,
      ...(parsed.data.type === "QUIZ" ? { quiz: { create: {} } } : {}),
    },
  });
  refresh();
  redirect(`/admin/lessons/${lesson.id}`);
}

export async function updateLesson(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = lessonUpdateSchema.safeParse({
    title: text(fd, "title"),
    description: text(fd, "description"),
    tutorNotes: text(fd, "tutorNotes"),
    published: bool(fd, "published"),
    durationMin: text(fd, "durationMin") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { durationMin, ...data } = parsed.data;
  await prisma.lesson.update({
    where: { id },
    data: { ...data, ...(durationMin !== undefined ? { durationSec: Math.round(durationMin * 60) } : {}) },
  });
  refresh();
  return { ok: true };
}

export async function deleteLesson(id: string): Promise<ActionState> {
  await requireAdmin();
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id },
    select: { module: { select: { courseId: true } }, asset: { select: { id: true, storageKey: true } } },
  });
  await prisma.lesson.delete({ where: { id } });
  if (lesson.asset) await removeAssetFiles([lesson.asset]);
  refresh();
  redirect(`/admin/courses/${lesson.module.courseId}`);
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

const MOVABLE = ["program", "tier", "course", "module", "lesson", "question"] as const;
type Movable = (typeof MOVABLE)[number];

/** Move an item one place up (-1) or down (+1) among its siblings. */
export async function moveItem(kind: Movable, id: string, direction: -1 | 1): Promise<void> {
  await requireAdmin();
  // Server actions are callable with any arguments — don't trust `kind`.
  if (!MOVABLE.includes(kind) || (direction !== 1 && direction !== -1)) return;

  const siblings = await loadSiblings(kind, id);
  const index = siblings.findIndex((s) => s.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];

  // Rewrite every sibling's order so gaps/duplicates from older data heal too.
  const delegate = prisma[kind] as unknown as {
    update(args: { where: { id: string }; data: { order: number } }): Prisma.PrismaPromise<unknown>;
  };
  await prisma.$transaction(siblings.map((s, order) => delegate.update({ where: { id: s.id }, data: { order } })));
  refresh();
}

async function loadSiblings(kind: Movable, id: string): Promise<{ id: string }[]> {
  const orderBy = [{ order: "asc" as const }, { id: "asc" as const }];
  switch (kind) {
    case "program":
      return prisma.program.findMany({ orderBy, select: { id: true } });
    case "tier": {
      const t = await prisma.tier.findUniqueOrThrow({ where: { id }, select: { programId: true } });
      return prisma.tier.findMany({ where: { programId: t.programId }, orderBy, select: { id: true } });
    }
    case "course": {
      const c = await prisma.course.findUniqueOrThrow({ where: { id }, select: { programId: true } });
      return prisma.course.findMany({ where: { programId: c.programId }, orderBy, select: { id: true } });
    }
    case "module": {
      const m = await prisma.module.findUniqueOrThrow({ where: { id }, select: { courseId: true } });
      return prisma.module.findMany({ where: { courseId: m.courseId }, orderBy, select: { id: true } });
    }
    case "lesson": {
      const l = await prisma.lesson.findUniqueOrThrow({ where: { id }, select: { moduleId: true } });
      return prisma.lesson.findMany({ where: { moduleId: l.moduleId }, orderBy, select: { id: true } });
    }
    case "question": {
      const q = await prisma.question.findUniqueOrThrow({ where: { id }, select: { quizId: true } });
      return prisma.question.findMany({ where: { quizId: q.quizId }, orderBy, select: { id: true } });
    }
  }
}
