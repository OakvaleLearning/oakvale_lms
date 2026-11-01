import { NextResponse } from "next/server";
import { getModuleBySlugs, getModuleOutline } from "@/lib/lms/catalog";
import { getModuleProgress } from "@/lib/lms/progress";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/**
 * Legacy outline for app versions from before modules and topics: same data as
 * GET /api/v1/modules/<program>/<module>, under the old names (`course` is the
 * module, `modules` are its topics). New clients should use the modules route.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/courses/[program]/[course]">) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { program, course: slug } = await ctx.params;

  const found = await getModuleBySlugs(session, program, slug);
  if (!found) return jsonError("Course not found", 404);
  const { module: mod, lock } = found;
  const course = {
    id: mod.id,
    slug: mod.slug,
    title: mod.title,
    description: mod.description,
    program: { slug: mod.program.slug, title: mod.program.title },
    prerequisite: mod.prerequisite,
  };
  if (lock !== "OPEN") return NextResponse.json({ course, lock, modules: [], progress: null });

  const [topics, progress] = await Promise.all([
    getModuleOutline(session.userId, mod.id, { sequential: mod.sequential, isAdmin: session.role === "ADMIN" }),
    getModuleProgress(session.userId, [mod.id]),
  ]);
  return NextResponse.json({ course, lock, modules: topics, progress: progress.get(mod.id) });
}
