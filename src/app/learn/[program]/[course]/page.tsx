import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Lock, Loader } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getCourseBySlugs, getCourseOutline } from "@/lib/lms/catalog";
import { getCourseProgress } from "@/lib/lms/progress";
import { ButtonLink } from "@/components/ui/Button";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { LessonIcon } from "@/components/learn/LessonIcon";

export default async function CoursePage({ params, searchParams }: PageProps<"/learn/[program]/[course]">) {
  const { program: programSlug, course: courseSlug } = await params;
  const { locked: lockedNotice } = await searchParams;
  const session = await requireSession(`/learn/${programSlug}/${courseSlug}`);

  const found = await getCourseBySlugs(session, programSlug, courseSlug);
  if (!found) notFound();
  const { course, lock } = found;

  if (lock !== "OPEN") {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-ink-100 bg-white p-10 text-center">
        <Lock className="mx-auto size-10 text-ink-400" />
        <h2 className="mt-4 text-xl font-bold text-ink-900">{course.title}</h2>
        <p className="mt-2 text-sm text-ink-500">
          {lock === "PREREQUISITE"
            ? `Complete “${course.prerequisite?.title}” to unlock this course.`
            : "You are not enrolled in this course."}
        </p>
        <ButtonLink href={lock === "PREREQUISITE" ? "/learn" : `/enroll?track=${programSlug}`} className="mt-6">
          {lock === "PREREQUISITE" ? "Back to my learning" : "See enrolment options"}
        </ButtonLink>
      </div>
    );
  }

  const isAdmin = session.role === "ADMIN";
  const [modules, progressMap] = await Promise.all([
    getCourseOutline(session.userId, course.id, { sequential: course.sequential, isAdmin }),
    getCourseProgress(session.userId, [course.id]),
  ]);
  const progress = progressMap.get(course.id)!;
  const next = modules.flatMap((m) => m.lessons).find((l) => l.status !== "COMPLETED" && !l.locked);
  const base = `/learn/${programSlug}/${courseSlug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/learn" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-primary-600">
        <ArrowLeft className="size-4" /> My learning
      </Link>
      <div className="mt-4 rounded-3xl border border-ink-100 bg-white p-6 sm:p-8">
        <div className="text-sm font-medium text-primary-600">{course.program.title}</div>
        <h2 className="mt-1 text-2xl font-bold text-ink-900">{course.title}</h2>
        {course.description && <p className="mt-2 text-ink-500">{course.description}</p>}
        <div className="mt-6">
          <ProgressBar percent={progress.percent} />
          <div className="mt-2 text-sm text-ink-500">
            {progress.completed} of {progress.total} lessons complete
          </div>
        </div>
        {next && (
          <ButtonLink href={`${base}/${next.id}`} className="mt-6">
            {progress.completed === 0 ? "Start course" : "Continue"}
          </ButtonLink>
        )}
      </div>

      {lockedNotice && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete the earlier lessons first — this course unlocks lessons in order.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {modules.map((m) => (
          <section key={m.id} className="overflow-hidden rounded-3xl border border-ink-100 bg-white">
            <h3 className="border-b border-ink-100 px-6 py-4 font-bold text-ink-900">{m.title}</h3>
            <ul>
              {m.lessons.map((l) => {
                const StatusIcon = l.locked ? Lock : l.status === "COMPLETED" ? CheckCircle2 : l.status === "IN_PROGRESS" ? Loader : Circle;
                const row = (
                  <>
                    <StatusIcon
                      className={
                        l.status === "COMPLETED" ? "size-5 shrink-0 text-emerald-500" : "size-5 shrink-0 text-ink-300"
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{l.title}</span>
                    <LessonIcon type={l.type} className="shrink-0 text-ink-400" />
                  </>
                );
                return (
                  <li key={l.id} className="border-b border-ink-50 last:border-0">
                    {l.locked ? (
                      <div className="flex items-center gap-3 px-6 py-3.5 opacity-60">{row}</div>
                    ) : (
                      <Link href={`${base}/${l.id}`} className="flex items-center gap-3 px-6 py-3.5 hover:bg-ink-50">
                        {row}
                      </Link>
                    )}
                  </li>
                );
              })}
              {m.lessons.length === 0 && <li className="px-6 py-3.5 text-sm text-ink-400">No lessons yet.</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
