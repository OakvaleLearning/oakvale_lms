import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { checkLessonAccess, getOrderedLessons } from "@/lib/lms/access";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { LessonParts } from "@/components/learn/LessonParts";
import { TutorPanel } from "@/components/learn/TutorPanel";
import { getTutorAvailability } from "@/lib/lms/tutor";
import { getCourseOutline } from "@/lib/lms/catalog";
import { getBlockProgress, getCourseProgress } from "@/lib/lms/progress";
import { CourseOutline } from "@/components/learn/CourseOutline";
import { Breadcrumbs } from "@/components/dashboard/ui";

export default async function LessonPage({ params }: PageProps<"/learn/[program]/[course]/[lessonId]">) {
  const { program: programSlug, course: courseSlug, lessonId } = await params;
  const base = `/learn/${programSlug}/${courseSlug}`;
  const session = await requireSession(`${base}/${lessonId}`);

  const access = await checkLessonAccess(session, lessonId);
  if (!access.ok) {
    if (access.reason === "NOT_FOUND") notFound();
    if (access.reason === "UNVERIFIED") redirect(`/verify-email?next=${encodeURIComponent(`${base}/${lessonId}`)}`);
    redirect(access.reason === "SEQUENTIAL" ? `${base}?locked=1` : access.reason === "EXAM_LOCKED" ? `${base}?locked=exam` : base);
  }
  const { lesson } = access;
  const course = lesson.module.course;
  if (course.slug !== courseSlug || course.program.slug !== programSlug) notFound();

  const isAdmin = session.role === "ADMIN";
  const [ordered, progress, partProgress, tutor, outline, courseProgress] = await Promise.all([
    getOrderedLessons(course.id, isAdmin),
    prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: session.userId, lessonId } } }),
    getBlockProgress(session.userId, lessonId),
    getTutorAvailability(session, lesson),
    getCourseOutline(session.userId, course.id, { sequential: course.sequential, isAdmin }),
    getCourseProgress(session.userId, [course.id]),
  ]);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const completed = progress?.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-6xl pb-16 lg:pb-0">
      <Breadcrumbs
        items={[
          { label: "My learning", href: "/learn" },
          { label: course.title, href: base },
          { label: lesson.title },
        ]}
      />

      <header className="mt-5 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-medium text-ink-700 ring-1 ring-line">
              <LessonIcon type={lesson.type} className="size-3.5" />
              {lesson.type === "MIXED" ? `Multi-part · ${lesson.blocks.length} parts` : LESSON_TYPE_LABEL[lesson.type]}
            </span>
            <span className="truncate">{lesson.module.title}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight text-ink-950">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {completed && (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="size-4" /> Completed
            </span>
          )}
          <span className="tabular-nums text-ink-500">
            Lesson {index + 1} of {ordered.length}
          </span>
          <Link
            href={next ? `${base}/${next.id}` : base}
            title={next ? next.title : "Back to course overview"}
            className="group inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary-600 pl-4 pr-3 font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-primary-700"
          >
            {next ? "Next lesson" : "Finish course"}
            <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <LessonParts lesson={lesson} session={session} progress={partProgress} />

          {lesson.description && (
            <section className="card mt-6 p-6 sm:p-8">
              <h2 className="text-sm font-medium text-ink-950">About this lesson</h2>
              <div className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{lesson.description}</div>
            </section>
          )}

          {prev && (
            <nav aria-label="Lesson navigation" className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href={`${base}/${prev.id}`}
                className="card group flex items-center gap-3 p-4 transition-colors hover:border-ink-300"
              >
                <ChevronLeft className="size-4 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-ink-700" />
                <span className="min-w-0">
                  <span className="block text-xs text-ink-500">Previous</span>
                  <span className="block truncate text-sm font-medium text-ink-900">{prev.title}</span>
                </span>
              </Link>
            </nav>
          )}
        </div>

        <div className="lg:sticky lg:top-8">
          <CourseOutline
            modules={outline}
            base={base}
            currentId={lesson.id}
            progress={courseProgress.get(course.id)!}
          />
        </div>
      </div>

      <TutorPanel key={lesson.id} lessonId={lesson.id} lessonTitle={lesson.title} locked={tutor !== "OPEN"} />
    </div>
  );
}
