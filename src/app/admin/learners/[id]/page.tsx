import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatDay, formatNaira, whatsappLink } from "@/lib/utils";
import { getCourseProgress } from "@/lib/lms/progress";
import { StatusBadge, PageHeader } from "@/components/dashboard/ui";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { ActionForm, DeleteButton, Panel, Select } from "@/components/admin/forms";
import { cancelEnrollment, grantEnrollment } from "../actions";

export default async function LearnerPage({ params }: PageProps<"/admin/learners/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const learner = await prisma.user.findUnique({
    where: { id },
    include: {
      enrollments: {
        orderBy: { createdAt: "desc" },
        include: {
          tier: { include: { program: { select: { title: true } }, courses: { include: { course: { select: { id: true, title: true } } } } } },
        },
      },
    },
  });
  if (!learner) notFound();

  const active = learner.enrollments.filter((e) => e.status === "ACTIVE");
  const courses = new Map(active.flatMap((e) => e.tier.courses.map((tc) => [tc.course.id, tc.course.title] as const)));
  const [progress, tiers, attempts] = await Promise.all([
    getCourseProgress(learner.id, [...courses.keys()]),
    prisma.tier.findMany({ orderBy: [{ program: { order: "asc" } }, { order: "asc" }], include: { program: { select: { title: true } } } }),
    prisma.quizAttempt.findMany({
      where: { userId: learner.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { quiz: { include: { lesson: { select: { title: true } } } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/learners" className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900">
        <ArrowLeft className="size-4" /> Learners
      </Link>

      <PageHeader
        eyebrow="Learner"
        title={learner.name}
        description={
          <>
          {learner.email}
          {learner.phone && (
            <>
              {" · "}
              <a href={whatsappLink(learner.phone)} className="text-primary-600" target="_blank" rel="noreferrer">
                {learner.phone}
              </a>
            </>
          )}
          {" · "}joined {formatDay(learner.createdAt)}
          </>
        }
      />

      <Panel title="Course progress">
        {courses.size === 0 ? (
          <p className="text-sm text-ink-400">Not enrolled in any courses.</p>
        ) : (
          <ul className="space-y-4">
            {[...courses].map(([courseId, title]) => {
              const p = progress.get(courseId)!;
              return (
                <li key={courseId}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-ink-800">{title}</span>
                    <span className="text-ink-500">
                      {p.completed}/{p.total} · {p.percent}%
                    </span>
                  </div>
                  <ProgressBar percent={p.percent} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Enrolments">
        <ul className="divide-y divide-line/70">
          {learner.enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900">
                  {e.tier.program.title} — {e.tier.name}
                </div>
                <div className="text-xs text-ink-400">
                  {e.source === "PAYSTACK" ? formatNaira(e.amount) : e.source === "ADMIN" ? "Granted by admin" : "Imported"} ·{" "}
                  {formatDay(e.createdAt)}
                </div>
              </div>
              <StatusBadge status={e.status} />
              {e.status === "ACTIVE" && (
                <DeleteButton
                  onDelete={cancelEnrollment.bind(null, e.id)}
                  confirmText="Cancel this enrolment? The learner loses access to its courses."
                  label="Cancel"
                />
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={grantEnrollment.bind(null, learner.id)} submitLabel="Grant access" className="mt-4">
          <Select name="tierId" required defaultValue="">
            <option value="" disabled>
              Grant a tier without payment…
            </option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.program.title} — {t.name}
              </option>
            ))}
          </Select>
        </ActionForm>
      </Panel>

      {attempts.length > 0 && (
        <Panel title="Recent quiz attempts">
          <ul className="divide-y divide-line/70 text-sm">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink-800">{a.quiz.lesson.title}</span>
                <span className={a.passed ? "font-semibold text-emerald-600" : "text-accent-600"}>
                  {a.score}% · {formatDay(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
