import { NextResponse } from "next/server";
import { getModuleBySlugs, getModuleOutline } from "@/lib/lms/catalog";
import { getModuleProgress } from "@/lib/lms/progress";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/** Module outline: topics → lessons with status and sequential locks. */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/modules/[program]/[module]">) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { program, module: moduleSlug } = await ctx.params;

  const found = await getModuleBySlugs(session, program, moduleSlug);
  if (!found) return jsonError("Module not found", 404);
  const { module: mod, lock } = found;
  const summary = {
    id: mod.id,
    slug: mod.slug,
    title: mod.title,
    description: mod.description,
    program: { slug: mod.program.slug, title: mod.program.title },
    prerequisite: mod.prerequisite,
  };
  if (lock !== "OPEN") return NextResponse.json({ module: summary, lock, topics: [], progress: null });

  const [topics, progress] = await Promise.all([
    getModuleOutline(session.userId, mod.id, { sequential: mod.sequential, isAdmin: session.role === "ADMIN" }),
    getModuleProgress(session.userId, [mod.id]),
  ]);
  return NextResponse.json({ module: summary, lock, topics, progress: progress.get(mod.id) });
}
