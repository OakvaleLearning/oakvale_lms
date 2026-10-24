import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { checkLessonAccess } from "@/lib/lms/access";
import { submitQuiz } from "@/lib/lms/quiz";

const schema = z.object({
  answers: z.record(z.string().max(40), z.array(z.string().max(40)).max(20)),
});

/** Submit a quiz attempt; graded on the server. */
export async function POST(req: Request, ctx: RouteContext<"/api/lms/quiz/[lessonId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { lessonId } = await ctx.params;

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok || !access.lesson.blocks.some((b) => b.type === "QUIZ")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid answers" }, { status: 400 });

  const result = await submitQuiz(session.userId, lessonId, parsed.data.answers);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
