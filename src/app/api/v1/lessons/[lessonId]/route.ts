import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkLessonAccess, getOrderedLessons } from "@/lib/lms/access";
import { getQuizForLearner } from "@/lib/lms/quiz";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/**
 * One lesson for the mobile player. `content` says how to play it:
 * - media: stream `url` (presigned, ~2h) natively and resume at `startAt`
 * - quiz: questions without answers; submit to POST /api/lms/quiz/<id>
 * - web: SCORM/HTML; get a WebView URL from POST /api/v1/lessons/<id>/launch
 * - unavailable: content not uploaded yet
 * Progress is reported to POST /api/lms/progress, as on the web.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/v1/lessons/[lessonId]">) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { lessonId } = await ctx.params;

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) {
    return access.reason === "NOT_FOUND"
      ? jsonError("Lesson not found", 404)
      : NextResponse.json({ error: "Lesson locked", reason: access.reason }, { status: 403 });
  }
  const { lesson } = access;
  const course = lesson.module.course;

  const [ordered, progress] = await Promise.all([
    getOrderedLessons(course.id, session.role === "ADMIN"),
    prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: session.userId, lessonId } } }),
  ]);
  const index = ordered.findIndex((l) => l.id === lessonId);

  return NextResponse.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      description: lesson.description,
      moduleTitle: lesson.module.title,
      course: { slug: course.slug, title: course.title, programSlug: course.program.slug },
      status: progress?.status ?? "NOT_STARTED",
      score: progress?.score ?? null,
      prevId: ordered[index - 1]?.id ?? null,
      nextId: ordered[index + 1]?.id ?? null,
    },
    content: await lessonContent(lesson, session.userId, progress?.positionSec ?? 0),
  });
}

type Lesson = Extract<Awaited<ReturnType<typeof checkLessonAccess>>, { ok: true }>["lesson"];

async function lessonContent(lesson: Lesson, userId: string, startAt: number) {
  if (lesson.type === "QUIZ") {
    const quiz = await getQuizForLearner(lesson.id, userId);
    if (!quiz || quiz.questions.length === 0) return { kind: "unavailable" as const };
    return {
      kind: "quiz" as const,
      questions: quiz.questions,
      passMark: quiz.passMark,
      attemptsLeft: quiz.maxAttempts === null ? null : Math.max(0, quiz.maxAttempts - quiz.attemptsUsed),
      bestScore: quiz.bestScore,
      passed: quiz.passed,
    };
  }
  const asset = lesson.asset;
  if (!asset || asset.status !== "READY" || !isStorageConfigured()) return { kind: "unavailable" as const };
  if (lesson.type === "VIDEO" || lesson.type === "AUDIO") {
    return { kind: "media" as const, url: await presignDownload(asset.storageKey), mimeType: asset.mimeType, startAt };
  }
  return { kind: "web" as const };
}
