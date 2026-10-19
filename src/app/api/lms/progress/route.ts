import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { recordProgress } from "@/lib/lms/progress";

const schema = z.object({
  lessonId: z.string().min(1).max(40),
  positionSec: z.number().min(0).max(24 * 60 * 60).optional(),
  completed: z.boolean().optional(),
});

/** Video/audio heartbeats and "mark complete" for HTML lessons. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { lessonId, positionSec, completed } = parsed.data;

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  // Quizzes and SCORM packages report completion through their own endpoints.
  if (completed && (access.lesson.type === "QUIZ" || access.lesson.type === "SCORM")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 400 });
  }

  const progress = await recordProgress(session.userId, lessonId, { positionSec, completed });
  return NextResponse.json({ ok: true, status: progress.status });
}
