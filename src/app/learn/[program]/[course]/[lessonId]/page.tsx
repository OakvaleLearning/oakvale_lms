import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { checkLessonAccess, getOrderedLessons } from "@/lib/lms/access";
import { getQuizForLearner } from "@/lib/lms/quiz";
import { getInitialCmi } from "@/lib/lms/scorm";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { ButtonLink } from "@/components/ui/Button";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { MediaPlayer } from "@/components/learn/MediaPlayer";
import { ScormPlayer } from "@/components/learn/ScormPlayer";
import { QuizPlayer } from "@/components/learn/QuizPlayer";
import { MarkCompleteButton } from "@/components/learn/MarkCompleteButton";

export default async function LessonPage({ params }: PageProps<"/learn/[program]/[course]/[lessonId]">) {
  const { program: programSlug, course: courseSlug, lessonId } = await params;
  const base = `/learn/${programSlug}/${courseSlug}`;
  const session = await requireSession(`${base}/${lessonId}`);

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) {
    if (access.reason === "NOT_FOUND") notFound();
    redirect(access.reason === "SEQUENTIAL" ? `${base}?locked=1` : base);
  }
  const { lesson } = access;
  const course = lesson.module.course;
  if (course.slug !== courseSlug || course.program.slug !== programSlug) notFound();

  const isAdmin = session.role === "ADMIN";
  const [ordered, progress] = await Promise.all([
    getOrderedLessons(course.id, isAdmin),
    prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: session.userId, lessonId } } }),
  ]);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const completed = progress?.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-primary-600">
        <ArrowLeft className="size-4" /> {course.title}
      </Link>

      <div className="mt-3 mb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-400">
          <LessonIcon type={lesson.type} className="size-3.5" />
          {LESSON_TYPE_LABEL[lesson.type]} · {lesson.module.title}
        </div>
        <h2 className="mt-1 text-2xl font-bold text-ink-900">{lesson.title}</h2>
      </div>

      <LessonBody lesson={lesson} session={session} startAt={progress?.positionSec ?? 0} completed={completed} />

      {lesson.description && (
        <div className="mt-6 whitespace-pre-line rounded-3xl border border-ink-100 bg-white p-6 text-sm leading-relaxed text-ink-700">
          {lesson.description}
        </div>
      )}

      <nav className="mt-8 flex items-center justify-between gap-3">
        {prev ? (
          <ButtonLink href={`${base}/${prev.id}`} variant="outline" size="sm">
            <ChevronLeft className="size-4" /> Previous
          </ButtonLink>
        ) : (
          <span />
        )}
        {next ? (
          <ButtonLink href={`${base}/${next.id}`} size="sm">
            Next <ChevronRight className="size-4" />
          </ButtonLink>
        ) : (
          <ButtonLink href={base} size="sm">
            Back to course
          </ButtonLink>
        )}
      </nav>
    </div>
  );
}

type Lesson = Extract<Awaited<ReturnType<typeof checkLessonAccess>>, { ok: true }>["lesson"];

async function LessonBody({
  lesson,
  session,
  startAt,
  completed,
}: {
  lesson: Lesson;
  session: { userId: string; name: string };
  startAt: number;
  completed: boolean;
}) {
  if (lesson.type === "QUIZ") {
    const quiz = await getQuizForLearner(lesson.id, session.userId);
    if (!quiz || quiz.questions.length === 0) return <Placeholder />;
    return (
      <QuizPlayer
        key={lesson.id}
        lessonId={lesson.id}
        questions={quiz.questions}
        passMark={quiz.passMark}
        attemptsLeft={quiz.maxAttempts === null ? null : Math.max(0, quiz.maxAttempts - quiz.attemptsUsed)}
        bestScore={quiz.bestScore}
        passed={quiz.passed}
      />
    );
  }

  const asset = lesson.asset;
  if (!asset || asset.status !== "READY" || !isStorageConfigured()) return <Placeholder />;

  if (lesson.type === "VIDEO" || lesson.type === "AUDIO") {
    return (
      <MediaPlayer
        key={lesson.id}
        lessonId={lesson.id}
        kind={lesson.type}
        src={await presignDownload(asset.storageKey)}
        startAt={startAt}
        completed={completed}
      />
    );
  }

  const src = `/content/${asset.id}/${asset.launchPath}`;
  if (lesson.type === "SCORM") {
    const version = asset.scormVersion === "1.2" ? "1.2" : "2004";
    const initialCmi = await getInitialCmi(session.userId, lesson.id, version, {
      id: session.userId,
      name: session.name,
    });
    return <ScormPlayer key={lesson.id} lessonId={lesson.id} version={version} src={src} initialCmi={initialCmi} />;
  }

  // HTML
  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-ink-100 bg-white sm:aspect-video">
        <iframe src={src} title={lesson.title} className="absolute inset-0 size-full" allowFullScreen />
      </div>
      <div className="mt-4 flex justify-end">
        <MarkCompleteButton key={lesson.id} lessonId={lesson.id} completed={completed} />
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="grid aspect-video place-items-center rounded-3xl border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-500">
      This lesson&apos;s content is being prepared. Please check back soon.
    </div>
  );
}
