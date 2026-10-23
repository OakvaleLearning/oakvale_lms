import { NextResponse } from "next/server";
import { createLessonTicket } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/**
 * SCORM/HTML lessons run in a WebView, which needs a cookie session on this
 * domain. Returns a URL carrying a 2-minute ticket; /m/launch swaps it for a
 * cookie and opens the bare lesson player.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/lessons/[lessonId]/launch">) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { lessonId } = await ctx.params;

  const access = await checkLessonAccess(session, lessonId);
  const web = access.ok ? access.lesson.blocks.filter((b) => b.type === "SCORM" || b.type === "HTML") : [];
  if (!access.ok || web.length === 0) return jsonError("Not allowed", 403);

  // Which web part to open: the one asked for, else the lesson's first.
  const body = (await req.json().catch(() => null)) as { blockId?: unknown } | null;
  const part = web.find((b) => b.id === body?.blockId) ?? web[0];

  const ticket = await createLessonTicket(session.userId, lessonId);
  const url = new URL("/m/launch", req.url);
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("block", part.id);
  return NextResponse.json({ url: url.toString() });
}
