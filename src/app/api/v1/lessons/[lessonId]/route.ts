import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkLessonAccess, getOrderedLessons } from "@/lib/lms/access";
import { documentKind, isOfficeFile, officeViewerUrl } from "@/lib/lms/blocks";
import { getBlockProgress } from "@/lib/lms/progress";
import { getQuizForLearner } from "@/lib/lms/quiz";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/**
 * One lesson for the mobile player. A lesson is a list of `parts`, played in
 * order; each part's `content.kind` says how:
 * - media: stream `url` (presigned, ~2h) natively and resume at `startAt`
 * - quiz: questions without answers; submit to POST /api/lms/quiz/<lessonId>
 * - web: SCORM/HTML; get a WebView URL from POST /api/v1/lessons/<lessonId>/launch
 *   with `{ "blockId": "<part id>" }`
 * - document: `url` (presigned) to show (`display` "pdf" | "image"); for "download" files
 *   (Word/PowerPoint/Excel) show `viewUrl` in a web view instead. When `allowDownload` is
 *   false, don't offer save/share/open-externally controls
 * - text: `markdown` to render
 * - unavailable: content not uploaded yet
 * Progress is reported to POST /api/lms/progress with the part's `blockId`.
 * `content` repeats the first part's content for lessons with a single part
 * (older apps read it); lessons with several parts have `content.kind` "multipart".
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

  const [ordered, progress, partProgress] = await Promise.all([
    getOrderedLessons(course.id, session.role === "ADMIN"),
    prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: session.userId, lessonId } } }),
    getBlockProgress(session.userId, lessonId),
  ]);
  const index = ordered.findIndex((l) => l.id === lessonId);

  const parts = await Promise.all(
    lesson.blocks.map(async (block) => {
      const done = partProgress.get(block.id);
      return {
        id: block.id,
        type: block.type,
        title: block.title,
        required: block.required,
        status: done?.status ?? "NOT_STARTED",
        score: done?.score ?? null,
        content: await partContent(block, lesson.id, session.userId, done?.positionSec ?? 0),
      };
    })
  );

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
    parts,
    content: parts.length === 1 ? parts[0].content : parts.length === 0 ? { kind: "unavailable" as const } : { kind: "multipart" as const },
  });
}

type Part = Extract<Awaited<ReturnType<typeof checkLessonAccess>>, { ok: true }>["lesson"]["blocks"][number];

async function partContent(block: Part, lessonId: string, userId: string, startAt: number) {
  if (block.type === "TEXT") {
    return block.body.trim() ? { kind: "text" as const, markdown: block.body } : { kind: "unavailable" as const };
  }
  if (block.type === "QUIZ") {
    const quiz = await getQuizForLearner(lessonId, userId);
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
  const asset = block.asset;
  if (!asset || asset.status !== "READY" || !isStorageConfigured()) return { kind: "unavailable" as const };
  if (block.type === "VIDEO" || block.type === "AUDIO") {
    return { kind: "media" as const, url: await presignDownload(asset.storageKey), mimeType: asset.mimeType, startAt };
  }
  if (block.type === "DOCUMENT") {
    const display = documentKind(asset.fileName);
    return {
      kind: "document" as const,
      display,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      // false: hide any save/share/open-externally controls in the app.
      allowDownload: block.allowDownload,
      url: await presignDownload(asset.storageKey, display === "download" && block.allowDownload ? { downloadName: asset.fileName } : {}),
      // Office files: an embeddable viewer to show instead of downloading.
      viewUrl: isOfficeFile(asset.fileName) ? officeViewerUrl(await presignDownload(asset.storageKey)) : null,
    };
  }
  return { kind: "web" as const };
}
