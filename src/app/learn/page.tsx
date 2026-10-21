import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getLearnerHome, type LearnerCourseCard } from "@/lib/lms/catalog";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My learning" };

type CourseState = "LOCKED" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

function courseState(course: LearnerCourseCard): CourseState {
  if (course.lock !== "OPEN") return "LOCKED";
  if (course.progress.total > 0 && course.progress.percent >= 100) return "COMPLETED";
  return course.progress.completed > 0 ? "IN_PROGRESS" : "NOT_STARTED";
}

const STATE_CHIP: Record<CourseState, { label: string; className: string }> = {
  LOCKED: { label: "Locked", className: "bg-ink-100 text-ink-600" },
  NOT_STARTED: { label: "Not started", className: "bg-ink-100 text-ink-700" },
  IN_PROGRESS: { label: "In progress", className: "bg-primary-50 text-primary-700" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700" },
};

const STATE_ACTION: Record<Exclude<CourseState, "LOCKED">, string> = {
  NOT_STARTED: "Start course",
  IN_PROGRESS: "Continue",
  COMPLETED: "Review course",
};

export default async function LearnHome() {
  const session = await requireSession("/learn");
  const { programs, continueLesson } = await getLearnerHome(session.userId);
  const firstName = session.name.split(" ")[0];

  if (programs.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <PageHeader eyebrow="My learning" title={`Welcome, ${firstName}`} />
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          action={<ButtonLink href="/enroll">Browse programmes</ButtonLink>}
        >
          Once you enrol in a programme, your courses will appear here.
        </EmptyState>
      </div>
    );
  }

  const courses = programs.flatMap((p) => p.courses);
  const completedCourses = courses.filter((c) => courseState(c) === "COMPLETED").length;
  const lessonsDone = courses.reduce((n, c) => n + c.progress.completed, 0);
  const lessonsTotal = courses.reduce((n, c) => n + c.progress.total, 0);
  const overall = lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;
  const continueCourse = continueLesson && courses.find((c) => c.slug === continueLesson.courseSlug);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        eyebrow="My learning"
        title={`Welcome back, ${firstName}`}
        description="Pick up where you left off, or start something new."
      />

      <Reveal delay={0.04}>
        <dl className="card grid grid-cols-3 divide-x divide-line">
          <div className="p-4 sm:p-5">
            <dt className="text-xs text-ink-500 sm:text-sm">Overall progress</dt>
            <dd className="mt-1 flex items-center gap-3">
              <span className="font-display text-xl tabular-nums text-ink-950 sm:text-2xl">{overall}%</span>
              <ProgressBar percent={overall} className="hidden flex-1 sm:block" />
            </dd>
          </div>
          <div className="p-4 sm:p-5">
            <dt className="text-xs text-ink-500 sm:text-sm">Lessons completed</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-ink-950 sm:text-2xl">
              {lessonsDone}
              <span className="text-sm font-medium text-ink-400 sm:text-base"> / {lessonsTotal}</span>
            </dd>
          </div>
          <div className="p-4 sm:p-5">
            <dt className="text-xs text-ink-500 sm:text-sm">Courses completed</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-ink-950 sm:text-2xl">
              {completedCourses}
              <span className="text-sm font-medium text-ink-400 sm:text-base"> / {courses.length}</span>
            </dd>
          </div>
        </dl>
      </Reveal>

      {continueLesson && (
        <Reveal delay={0.08}>
          <Link
            href={continueLesson.href}
            className="group flex flex-col gap-6 rounded-2xl bg-primary-950 p-6 text-white shadow-raised transition-colors hover:bg-primary-900 sm:flex-row sm:items-center sm:p-7"
          >
            <span className="hidden size-12 shrink-0 place-items-center rounded-xl bg-white/10 sm:grid">
              <PlayCircle className="size-6 text-primary-200" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-primary-200">Continue where you left off</div>
              <div className="mt-1 font-display text-2xl leading-tight">{continueLesson.lessonTitle}</div>
              <div className="mt-1 truncate text-sm text-white/60">{continueLesson.courseTitle}</div>
              {continueCourse && (
                <div className="mt-4 flex max-w-sm items-center gap-3 text-xs text-white/70">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: `${continueCourse.progress.percent}%` }}
                    />
                  </div>
                  <span className="tabular-nums">{continueCourse.progress.percent}% of course</span>
                </div>
              )}
            </div>
            <span className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-lg bg-white px-5 text-sm font-medium text-primary-900 transition-colors group-hover:bg-primary-50 sm:self-auto">
              Resume lesson
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </Reveal>
      )}

      {programs.map((program) => (
        <section key={program.slug}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl text-ink-950">{program.title}</h2>
            <span className="text-sm text-ink-500">
              {program.courses.length} {program.courses.length === 1 ? "course" : "courses"}
            </span>
          </div>

          <Stagger className="mt-4 grid gap-4 sm:grid-cols-2">
            {program.courses.map((course) => (
              <StaggerItem key={course.id} className="flex">
                <CourseCard course={course} href={`/learn/${program.slug}/${course.slug}`} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      ))}
    </div>
  );
}

function CourseCard({ course, href }: { course: LearnerCourseCard; href: string }) {
  const state = courseState(course);
  const chip = STATE_CHIP[state];
  const { completed, total, percent } = course.progress;

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", chip.className)}>
          {state === "LOCKED" && <Lock className="size-3" />}
          {state === "COMPLETED" && <CheckCircle2 className="size-3" />}
          {chip.label}
        </span>
        <span className="text-xs tabular-nums text-ink-500">
          {total} {total === 1 ? "lesson" : "lessons"}
        </span>
      </div>
      <h3 className="mt-4 text-[17px] font-semibold leading-snug tracking-tight text-ink-950">{course.title}</h3>
      {course.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-500">{course.description}</p>
      )}
      <div className="mt-auto pt-6">
        {state === "LOCKED" ? (
          <p className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs leading-relaxed text-ink-600">
            {course.prerequisiteTitle
              ? `Complete “${course.prerequisiteTitle}” to unlock this course.`
              : "Complete the previous course to unlock this one."}
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="text-ink-500">
                {completed} of {total} done
              </span>
              <span className="font-medium tabular-nums text-ink-800">{percent}%</span>
            </div>
            <ProgressBar percent={percent} />
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm font-medium text-primary-700">
              {STATE_ACTION[state]}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </>
        )}
      </div>
    </>
  );

  if (state === "LOCKED") {
    return (
      <div className="flex w-full flex-col rounded-2xl border border-line bg-white/50 p-6" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="card group flex w-full flex-col p-6 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-raised"
    >
      {body}
    </Link>
  );
}
