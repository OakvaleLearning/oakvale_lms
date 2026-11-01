import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, Info, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getModuleBySlugs, getModuleOutline } from "@/lib/lms/catalog";
import { getModuleProgress } from "@/lib/lms/progress";
import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { LessonStatusIcon, formatDuration } from "@/components/learn/ModuleOutline";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

export default async function ModulePage({ params, searchParams }: PageProps<"/learn/[program]/[module]">) {
  const { program: programSlug, module: moduleSlug } = await params;
  const { locked: lockedNotice } = await searchParams;
  const session = await requireSession(`/learn/${programSlug}/${moduleSlug}`);

  const found = await getModuleBySlugs(session, programSlug, moduleSlug);
  if (!found) notFound();
  const { module: mod, lock } = found;

  if (lock !== "OPEN") {
    return (
      <EmptyState
        icon={Lock}
        title={mod.title}
        action={
          <ButtonLink href={lock === "PREREQUISITE" ? "/learn" : `/enroll?track=${programSlug}`}>
            {lock === "PREREQUISITE" ? "Back to my learning" : "See enrolment options"}
          </ButtonLink>
        }
      >
        {lock === "PREREQUISITE"
          ? `Complete “${mod.prerequisite?.title}” to unlock this module.`
          : "You are not enrolled in this module."}
      </EmptyState>
    );
  }

  const isAdmin = session.role === "ADMIN";
  const [topics, progressMap, certificate] = await Promise.all([
    getModuleOutline(session.userId, mod.id, { sequential: mod.sequential, isAdmin }),
    getModuleProgress(session.userId, [mod.id]),
    // The programme certificate covering this module (or one issued for the module before certificates were per programme).
    prisma.certificate.findFirst({
      where: {
        userId: session.userId,
        revokedAt: null,
        OR: [{ programId: mod.program.id, scope: { contains: mod.id } }, { moduleId: mod.id }],
      },
      orderBy: { issuedAt: "desc" },
      select: { serial: true, revokedAt: true },
    }),
  ]);
  const progress = progressMap.get(mod.id)!;
  const next = topics.flatMap((m) => m.lessons).find((l) => l.status !== "COMPLETED" && !l.locked);
  const base = `/learn/${programSlug}/${moduleSlug}`;

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumbs items={[{ label: "My learning", href: "/learn" }, { label: mod.title }]} />

      <PageHeader
        className="mt-5"
        eyebrow={mod.program.title}
        title={mod.title}
        description={mod.description}
      />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Stagger className="space-y-5">
          {lockedNotice && (
            <p className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Info className="mt-0.5 size-4 shrink-0" />
              {lockedNotice === "exam"
                ? "Complete every lesson first. The final assessment opens once you have."
                : "Complete the earlier lessons first. This module unlocks lessons in order."}
            </p>
          )}

          {topics.map((m, mi) => {
            const done = m.lessons.filter((l) => l.status === "COMPLETED").length;
            return (
              <StaggerItem key={m.id} as="section" className="card overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-500">
                      {m.id === "final-assessment" ? "After all lessons" : `Topic ${mi + 1}`}
                    </div>
                    <h2 className="mt-0.5 truncate text-[15px] font-semibold text-ink-950">{m.title}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <ProgressBar
                      percent={m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0}
                      className="hidden w-20 sm:block"
                    />
                    <span className="text-xs tabular-nums text-ink-500">
                      {done}/{m.lessons.length}
                    </span>
                  </div>
                </div>
                <ol>
                  {m.lessons.map((l) => {
                    const isNext = next?.id === l.id;
                    const duration = formatDuration(l.durationSec);
                    const row = (
                      <>
                        <LessonStatusIcon lesson={l} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", isNext ? "font-medium text-ink-950" : "text-ink-800")}>
                            {l.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                            <LessonIcon type={l.type} className="size-3.5" />
                            {l.exam ? (l.optional ? "Final assessment · Optional" : "Final assessment") : LESSON_TYPE_LABEL[l.type]}
                            {duration && <> · {duration}</>}
                          </span>
                        </span>
                        {isNext ? (
                          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-xs font-medium text-white">
                            {l.status === "IN_PROGRESS" ? "Continue" : "Start"}
                            <ArrowRight className="size-3.5" />
                          </span>
                        ) : l.locked ? (
                          <span className="hidden shrink-0 text-xs text-ink-400 sm:inline">Locked</span>
                        ) : l.status === "COMPLETED" ? (
                          <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">Review</span>
                        ) : null}
                      </>
                    );
                    return (
                      <li key={l.id} className="border-b border-line/70 last:border-0">
                        {l.locked ? (
                          <div
                            className="flex items-center gap-3 px-6 py-3.5 opacity-55"
                            title={l.exam ? "Complete every lesson to unlock" : "Complete the earlier lessons to unlock"}
                          >
                            {row}
                          </div>
                        ) : (
                          <Link
                            href={`${base}/${l.id}`}
                            className={cn(
                              "flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-canvas",
                              isNext && "bg-primary-50/50 hover:bg-primary-50"
                            )}
                          >
                            {row}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                  {m.lessons.length === 0 && <li className="px-6 py-4 text-sm text-ink-400">No lessons yet.</li>}
                </ol>
              </StaggerItem>
            );
          })}
        </Stagger>

        <Reveal delay={0.15} className="order-first lg:order-none lg:sticky lg:top-8">
          <aside className="card p-6">
            <div className="text-sm text-ink-500">Your progress</div>
            <div className="mt-2 flex items-baseline gap-0.5">
              <span className="font-display text-4xl leading-none text-ink-950 tabular-nums">{progress.percent}</span>
              <span className="font-display text-xl text-ink-400">%</span>
            </div>
            <ProgressBar percent={progress.percent} className="mt-5" />
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Completed</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink-900">{progress.completed}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Lessons</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink-900">{progress.total}</dd>
              </div>
            </dl>
            {next && (
              <p className="mt-5 text-xs text-ink-500">
                Up next: <span className="font-medium text-ink-800">{next.title}</span>
              </p>
            )}
            {next && (
              <ButtonLink href={`${base}/${next.id}`} className="mt-3 w-full">
                {progress.completed === 0 ? "Start module" : "Continue learning"}
                <ArrowRight className="size-4" />
              </ButtonLink>
            )}
            {mod.sequential && (
              <p className="mt-4 text-xs leading-relaxed text-ink-500">Lessons in this module unlock in order.</p>
            )}
            {certificate && !certificate.revokedAt ? (
              <Link
                href={`/certificates/${certificate.serial}`}
                className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 transition-colors hover:bg-emerald-100/70"
              >
                <Award className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Certificate earned</span>
                  <span className="block text-xs text-emerald-800/80">View and download</span>
                </span>
                <ArrowRight className="size-4 shrink-0" />
              </Link>
            ) : (
              mod.program.certificateEnabled && (
                <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-5 text-xs leading-relaxed text-ink-500">
                  <Award className="mt-px size-4 shrink-0 text-ink-400" />
                  <span>
                    Earn your {mod.program.title} certificate by completing every module in your enrolment
                    {` with a quiz average of ${mod.program.certificatePassMark}% or more`}.
                    {mod.program.cpdEnabled &&
                      ` Includes a CPD certificate from ${mod.program.cpdProvider || "an accredited CPD body"}.`}
                  </span>
                </p>
              )
            )}
          </aside>
        </Reveal>
      </div>
    </div>
  );
}
