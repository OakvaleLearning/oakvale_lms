import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { addLessonTime, MAX_TIME_BEAT_SEC } from "@/lib/lms/progress";

const schema = z.object({
  lessonId: z.string().min(1).max(40),
  seconds: z.number().int().min(1).max(MAX_TIME_BEAT_SEC),
});

/**
 * Time heartbeat from the web lesson page (LessonTimer): seconds the page was
 * visible and in use since the last beat. Only adds to a lesson the learner
 * has already opened, so no access check is needed here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role === "ADMIN") return NextResponse.json({ ok: true });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await addLessonTime(session.userId, parsed.data.lessonId, parsed.data.seconds);
  return NextResponse.json({ ok: true });
}
