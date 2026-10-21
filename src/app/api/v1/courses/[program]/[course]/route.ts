import { NextResponse } from "next/server";
import { getCourseBySlugs, getCourseOutline } from "@/lib/lms/catalog";
import { getCourseProgress } from "@/lib/lms/progress";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/** Course outline: modules → lessons with status and sequential locks. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/courses/[program]/[course]">) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { program, course: courseSlug } = await ctx.params;

  const found = await getCourseBySlugs(session, program, courseSlug);
  if (!found) return jsonError("Course not found", 404);
  const { course, lock } = found;
  const summary = {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    program: { slug: course.program.slug, title: course.program.title },
    prerequisite: course.prerequisite,
  };
  if (lock !== "OPEN") return NextResponse.json({ course: summary, lock, modules: [], progress: null });

  const [modules, progress] = await Promise.all([
    getCourseOutline(session.userId, course.id, { sequential: course.sequential, isAdmin: session.role === "ADMIN" }),
    getCourseProgress(session.userId, [course.id]),
  ]);
  return NextResponse.json({ course: summary, lock, modules, progress: progress.get(course.id) });
}
