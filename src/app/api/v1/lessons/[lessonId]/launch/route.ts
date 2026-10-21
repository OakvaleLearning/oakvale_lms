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
  if (!access.ok || (access.lesson.type !== "SCORM" && access.lesson.type !== "HTML")) {
    return jsonError("Not allowed", 403);
  }
  const ticket = await createLessonTicket(session.userId, lessonId);
  const url = new URL("/m/launch", req.url);
  url.searchParams.set("ticket", ticket);
  return NextResponse.json({ url: url.toString() });
}
