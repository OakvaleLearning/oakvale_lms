import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { saveScormState } from "@/lib/lms/scorm";

/**
 * scorm-again's lmsCommitUrl. Receives `{ cmi: {...} }` on every commit and
 * must answer `{ result: true, errorCode: 0 }`.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/lms/scorm/[lessonId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ result: false, errorCode: 101 }, { status: 401 });
  const { lessonId } = await ctx.params;

  const access = await checkLessonAccess(session, lessonId);
  const scorm = access.ok ? access.lesson.blocks.find((b) => b.type === "SCORM") : undefined;
  const version = scorm?.asset?.scormVersion;
  if (!access.ok || !version) {
    return NextResponse.json({ result: false, errorCode: 101 }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > 1_000_000) {
    return NextResponse.json({ result: false, errorCode: 101 }, { status: 413 });
  }
  let body: { cmi?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ result: false, errorCode: 101 }, { status: 400 });
  }
  if (!body.cmi || typeof body.cmi !== "object") {
    return NextResponse.json({ result: false, errorCode: 101 }, { status: 400 });
  }

  // Admin previews don't write learner state.
  if (session.role !== "ADMIN") {
    await saveScormState(session.userId, lessonId, version, body.cmi);
  }
  return NextResponse.json({ result: true, errorCode: 0 });
}
