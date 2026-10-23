import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { PartRequiredError, recordProgress, UnknownPartError } from "@/lib/lms/progress";

const schema = z.object({
  lessonId: z.string().min(1).max(40),
  /** Which part of the lesson; optional for one-part lessons (older apps send only the lesson). */
  blockId: z.string().min(1).max(40).optional(),
  positionSec: z.number().min(0).max(24 * 60 * 60).optional(),
  completed: z.boolean().optional(),
});

/** Video/audio heartbeats, and "mark complete" for web page, document and text parts. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { lessonId, blockId, positionSec, completed } = parsed.data;

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  // Quizzes and SCORM packages report completion through their own endpoints.
  const { blocks } = access.lesson;
  const part = blockId ? blocks.find((b) => b.id === blockId) : blocks.length === 1 ? blocks[0] : undefined;
  if (completed && part && (part.type === "QUIZ" || part.type === "SCORM")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 400 });
  }

  try {
    const progress = await recordProgress(session.userId, lessonId, { blockId, positionSec, completed });
    return NextResponse.json({ ok: true, status: progress.status });
  } catch (err) {
    if (err instanceof PartRequiredError || err instanceof UnknownPartError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
