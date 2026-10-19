import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Lock, PlayCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getLearnerHome } from "@/lib/lms/catalog";
import { ButtonLink } from "@/components/ui/Button";
import { ProgressBar } from "@/components/learn/ProgressBar";

export const metadata: Metadata = { title: "My learning" };

export default async function LearnHome() {
  const session = await requireSession("/learn");
  const { programs, continueLesson } = await getLearnerHome(session.userId);

  if (programs.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-ink-100 bg-white p-10 text-center">
        <BookOpen className="mx-auto size-10 text-primary-600" />
        <h2 className="mt-4 text-xl font-bold text-ink-900">No courses yet</h2>
        <p className="mt-2 text-sm text-ink-500">
          Once you enrol in a programme, your courses will appear here.
        </p>
        <ButtonLink href="/enroll" className="mt-6">
          Browse programmes
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {continueLesson && (
        <Link
          href={continueLesson.href}
          className="flex items-center gap-4 rounded-3xl bg-primary-600 p-5 text-white shadow-lg shadow-primary-600/25 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <PlayCircle className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-primary-100">Continue learning</div>
            <div className="truncate text-lg font-bold">{continueLesson.lessonTitle}</div>
            <div className="truncate text-sm text-primary-100">{continueLesson.courseTitle}</div>
          </div>
          <ArrowRight className="size-5 shrink-0" />
        </Link>
      )}

      {programs.map((program) => (
        <section key={program.slug}>
          <h2 className="text-xl font-bold text-ink-900">{program.title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {program.courses.map((course) => {
              const locked = course.lock !== "OPEN";
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-ink-900">{course.title}</h3>
                    {locked && <Lock className="size-4 shrink-0 text-ink-400" />}
                  </div>
                  {course.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-500">{course.description}</p>
                  )}
                  <div className="mt-5">
                    <ProgressBar percent={course.progress.percent} />
                    <div className="mt-2 text-xs text-ink-500">
                      {locked
                        ? "Complete the previous course to unlock"
                        : `${course.progress.completed} of ${course.progress.total} lessons complete`}
                    </div>
                  </div>
                </>
              );
              return locked ? (
                <div key={course.id} className="rounded-3xl border border-ink-100 bg-white/60 p-6 opacity-75">
                  {body}
                </div>
              ) : (
                <Link
                  key={course.id}
                  href={`/learn/${program.slug}/${course.slug}`}
                  className="rounded-3xl border border-ink-100 bg-white p-6 transition-colors hover:border-primary-300"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
