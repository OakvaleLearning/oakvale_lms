import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cn, formatDate, formatDay, formatDuration, formatNaira, whatsappLink } from "@/lib/utils";
import { getCurrentPoints, getLearningRecord, getRecordModuleIds, type LessonRecord } from "@/lib/lms/learner-report";
import { StatusBadge, PageHeader } from "@/components/dashboard/ui";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { ActionForm, CheckCard, DeleteButton, Panel, Select } from "@/components/admin/forms";
import { getModuleAccess } from "@/lib/lms/pre-assessment";
import { cancelEnrollment, grantEnrollment, setPreAssessmentWaiver } from "../actions";

const KIND_LABEL = { LESSON: "Lesson", QUIZ: "Quiz", EXAM: "Final assessment" } as const;

const STATUS_TEXT: Record<LessonRecord["status"], { label: string; className: string }> = {
  COMPLETED: { label: "Completed", className: "text-emerald-700" },
  IN_PROGRESS: { label: "In progress", className: "text-amber-700" },
  NOT_STARTED: { label: "Not started", className: "text-ink-400" },
};

const dash = <span className="text-ink-300">—</span>;
const when = (d: Date | null) => (d ? formatDate(d) : dash);
const took = (sec: number | null) => (sec === null ? dash : formatDuration(sec));
const spent = (sec: number) => (sec > 0 ? formatDuration(sec) : dash);

const PRE_END: Record<string, string> = { SUBMITTED: "Submitted", TIMED_OUT: "Time ran out", TERMINATED: "Ended: too many strikes" };

export default async function LearnerPage({ params }: PageProps<"/admin/learners/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const learner = await prisma.user.findUnique({
    where: { id },
    include: {
      enrollments: {
        orderBy: { createdAt: "desc" },
        include: {
          tier: { include: { program: { select: { title: true } }, modules: { include: { module: { select: { id: true, title: true } } } } } },
        },
      },
    },
  });
  if (!learner) notFound();

  const active = learner.enrollments.filter((e) => e.status === "ACTIVE");
  const isActive = active.length > 0;
  const activeSince = active
    .map((e) => e.activatedAt ?? e.createdAt)
    .reduce<Date | null>((first, d) => (!first || d < first ? d : first), null);
  const activeModuleIds = new Set(active.flatMap((e) => e.tier.modules.map((tm) => tm.module.id)));

  const [record, points, tiers, attempts, preAttempts, access] = await Promise.all([
    getRecordModuleIds(learner.id, activeModuleIds).then((ids) => getLearningRecord(learner.id, ids)),
    getCurrentPoints([learner.id]),
    prisma.tier.findMany({ orderBy: [{ program: { order: "asc" } }, { order: "asc" }], include: { program: { select: { title: true } } } }),
    prisma.quizAttempt.findMany({
      where: { userId: learner.id },
      orderBy: { createdAt: "desc" },
      include: {
        quiz: {
          select: {
            kind: true,
            passMark: true,
            lesson: { select: { id: true, title: true, topic: { select: { title: true, module: { select: { title: true } } } } } },
          },
        },
      },
    }),
    prisma.preAssessmentAttempt.findMany({
      where: { userId: learner.id },
      orderBy: { startedAt: "desc" },
      include: { assessment: { select: { passMark: true, tier: { select: { id: true, name: true, program: { select: { title: true } } } } } } },
    }),
    getModuleAccess(learner.id),
  ]);

  const point = points.get(learner.id);
  const totalDone = record.reduce((n, m) => n + m.topics.reduce((k, t) => k + t.lessonList.filter((l) => l.status === "COMPLETED").length, 0), 0);
  const totalTime = record.reduce((n, m) => n + m.timeSpentSec, 0);
  const passedQuizzes = new Set(attempts.filter((a) => a.passed).map((a) => a.quizId)).size;
  const quizzesTaken = new Set(attempts.map((a) => a.quizId)).size;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin/learners" className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900">
        <ArrowLeft className="size-4" /> Learners
      </Link>

      <PageHeader
        eyebrow={isActive ? "Active learner" : "Registered, not active"}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Status">
          <span className={isActive ? "text-emerald-700" : "text-ink-500"}>{isActive ? "Active" : "Not active"}</span>
          <Hint>
            {isActive
              ? `since ${formatDay(activeSince!)}`
              : learner.enrollments.some((e) => e.status === "PENDING")
                ? "checkout started, not paid"
                : "no paid enrolment"}
          </Hint>
        </Summary>
        <Summary label="Currently on">
          {point ? (
            <>
              <span className="block truncate text-base font-medium text-ink-950" title={point.lessonTitle}>
                {point.lessonTitle}
              </span>
              <Hint>
                {point.moduleTitle} · {point.topicTitle} · {point.status === "COMPLETED" ? "completed" : "in progress"}
              </Hint>
              <Hint>last active {formatDate(point.at)}</Hint>
            </>
          ) : (
            <span className="text-ink-400">Not started</span>
          )}
        </Summary>
        <Summary label="Lessons completed">
          {totalDone}
          <Hint>{totalTime > 0 ? `${formatDuration(totalTime)} spent on lessons` : "no lesson time recorded yet"}</Hint>
        </Summary>
        <Summary label="Quizzes and exams">
          {passedQuizzes}/{quizzesTaken} <span className="text-sm font-normal text-ink-500">passed</span>
          <Hint>
            {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}
            {preAttempts.length > 0 && ` · ${preAttempts.length} pre-assessment`}
          </Hint>
        </Summary>
      </div>

      <Panel
        title="Learning record"
        description="Each module, topic and lesson: when it was started and completed, how long that took, and active time on the lesson page (counted from November 2026, web only)."
        flush
      >
        {record.length === 0 ? (
          <p className="p-6 text-sm text-ink-400">Not enrolled in any modules, and no lesson activity.</p>
        ) : (
          <div className="divide-y divide-line">
            {record.map((mod) => (
              <details key={mod.id} open={mod.completed < mod.lessons || record.length === 1} className="group/module">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-ink-50 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-400 transition-transform group-open/module:rotate-90" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-medium text-ink-900">
                        {mod.title}
                        <span className="ml-2 text-xs font-normal text-ink-400">{mod.programTitle}</span>
                        {!activeModuleIds.has(mod.id) && <span className="ml-2 text-xs font-normal text-amber-700">no active enrolment</span>}
                      </span>
                      <span className="text-sm tabular-nums text-ink-500">
                        {mod.completed}/{mod.lessons} · {mod.percent}%
                      </span>
                    </div>
                    <ProgressBar percent={mod.percent} className="mt-2" />
                    <RollupLine started={mod.startedAt} completed={mod.completedAt} elapsed={mod.elapsedSec} spentSec={mod.timeSpentSec} />
                    {mod.nextLesson && mod.completed < mod.lessons && (
                      <p className="mt-1 text-xs text-ink-600">
                        {mod.nextLesson.status === "IN_PROGRESS" ? "On" : "Up next"}: <span className="font-medium">{mod.nextLesson.title}</span>{" "}
                        <span className="text-ink-400">({mod.nextLesson.topicTitle})</span>
                      </p>
                    )}
                  </div>
                </summary>

                <div className="space-y-3 bg-canvas/50 px-3 pb-4 sm:px-6">
                  {mod.topics.map((topic) => (
                    <details
                      key={topic.id}
                      open={topic.startedAt !== null && topic.completedAt === null}
                      className="group/topic overflow-hidden rounded-xl border border-line bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-start gap-2.5 px-4 py-3 hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-ink-400 transition-transform group-open/topic:rotate-90" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                            <span className="font-medium text-ink-800">{topic.title}</span>
                            <span className="tabular-nums text-ink-500">
                              {topic.completed}/{topic.lessons}
                              {topic.completedAt && <span className="ml-1.5 text-emerald-700">· done</span>}
                            </span>
                          </div>
                          <RollupLine
                            started={topic.startedAt}
                            completed={topic.completedAt}
                            elapsed={topic.elapsedSec}
                            spentSec={topic.timeSpentSec}
                          />
                        </div>
                      </summary>
                      {topic.lessonList.length === 0 ? (
                        <p className="border-t border-line px-4 py-3 text-sm text-ink-400">No published lessons.</p>
                      ) : (
                        <div className="overflow-x-auto border-t border-line">
                          <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
                              <tr>
                                <th className="px-4 py-2 font-medium">Lesson</th>
                                <th className="px-4 py-2 font-medium">Status</th>
                                <th className="px-4 py-2 font-medium">Started</th>
                                <th className="px-4 py-2 font-medium">Completed</th>
                                <th className="px-4 py-2 font-medium" title="Calendar time from first opening to completing">
                                  Took
                                </th>
                                <th className="px-4 py-2 font-medium" title="Active time on the lesson page">
                                  Time spent
                                </th>
                                <th className="px-4 py-2 font-medium">Score</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line/70">
                              {topic.lessonList.map((l) => (
                                <tr key={l.id} className={cn(point?.lessonId === l.id && "bg-primary-50/50")}>
                                  <td className="px-4 py-2.5">
                                    <span className="text-ink-900">{l.title}</span>
                                    {l.kind !== "LESSON" && (
                                      <span className="ml-1.5 text-xs text-ink-400">
                                        {KIND_LABEL[l.kind]}
                                        {!l.required && " (optional)"}
                                      </span>
                                    )}
                                    {point?.lessonId === l.id && <span className="ml-1.5 text-xs font-medium text-primary-700">· current</span>}
                                  </td>
                                  <td className={cn("px-4 py-2.5 whitespace-nowrap", STATUS_TEXT[l.status].className)}>
                                    {STATUS_TEXT[l.status].label}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-600">{when(l.startedAt)}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-600">{when(l.completedAt)}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-ink-600">{took(l.elapsedSec)}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-ink-600">{spent(l.timeSpentSec)}</td>
                                  <td className="px-4 py-2.5 tabular-nums text-ink-600">{l.score === null ? dash : `${l.score}%`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </details>
                  ))}
                  {mod.topics.length === 0 && <p className="px-1 text-sm text-ink-400">No topics yet.</p>}
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Quiz and final assessment attempts"
        description={attempts.length ? `${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"}, newest first` : undefined}
        flush
      >
        {attempts.length === 0 ? (
          <p className="p-6 text-sm text-ink-400">No quiz or final assessment attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Assessment</th>
                  <th className="px-6 py-2.5 font-medium">Type</th>
                  <th className="px-6 py-2.5 font-medium">Score</th>
                  <th className="px-6 py-2.5 font-medium">Result</th>
                  <th className="px-6 py-2.5 font-medium">Time taken</th>
                  <th className="px-6 py-2.5 font-medium">Submitted</th>
                  <th className="px-6 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {attempts.map((a) => {
                  // Attempt number for this quiz, counting from the first.
                  const n = attempts.filter((x) => x.quizId === a.quizId && x.createdAt <= a.createdAt).length;
                  return (
                    <tr key={a.id} className="hover:bg-ink-50">
                      <td className="px-6 py-3">
                        <div className="text-ink-900">{a.quiz.lesson.title}</div>
                        <div className="text-xs text-ink-400">
                          {a.quiz.lesson.topic.module.title} · {a.quiz.lesson.topic.title} · attempt {n}
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-ink-600">{a.quiz.kind === "EXAM" ? "Final assessment" : "Quiz"}</td>
                      <td className="px-6 py-3 whitespace-nowrap tabular-nums text-ink-900">
                        {a.score}% <span className="text-xs text-ink-400">/ {a.quiz.passMark}%</span>
                      </td>
                      <td className={cn("px-6 py-3 font-medium", a.passed ? "text-emerald-700" : "text-accent-700")}>
                        {a.passed ? "Passed" : "Not passed"}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap tabular-nums text-ink-600">
                        {a.durationSec === null ? dash : formatDuration(a.durationSec)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-ink-600">{formatDate(a.createdAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/admin/learners/${learner.id}/attempts/${a.id}`}
                          className="text-xs font-medium whitespace-nowrap text-primary-700 hover:text-primary-900"
                        >
                          Answers →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {preAttempts.length > 0 && (
        <Panel title="Pre-assessment attempts" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Tier</th>
                  <th className="px-6 py-2.5 font-medium">Score</th>
                  <th className="px-6 py-2.5 font-medium">Result</th>
                  <th className="px-6 py-2.5 font-medium">Time taken</th>
                  <th className="px-6 py-2.5 font-medium">Started</th>
                  <th className="px-6 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {preAttempts.map((a) => {
                  const result = a.voidedAt
                    ? "Cancelled after review"
                    : !a.submittedAt
                      ? "In progress"
                      : a.passed
                        ? "Passed"
                        : "Not passed";
                  return (
                    <tr key={a.id} className="hover:bg-ink-50">
                      <td className="px-6 py-3">
                        <div className="text-ink-900">
                          {a.assessment.tier.program.title} ({a.assessment.tier.name})
                        </div>
                        <div className="text-xs text-ink-400">
                          {a.endReason ? PRE_END[a.endReason] : "Open"}
                          {a.strikes > 0 && ` · ${a.strikes} ${a.strikes === 1 ? "strike" : "strikes"}`}
                          {a.resetAt && " · reset"}
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap tabular-nums text-ink-900">
                        {a.score === null ? dash : `${a.score}%`} <span className="text-xs text-ink-400">/ {a.assessment.passMark}%</span>
                      </td>
                      <td className={cn("px-6 py-3 font-medium", a.passed && !a.voidedAt ? "text-emerald-700" : "text-ink-700")}>{result}</td>
                      <td className="px-6 py-3 whitespace-nowrap tabular-nums text-ink-600">
                        {a.submittedAt ? formatDuration((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000) : dash}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-ink-600">{formatDate(a.startedAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/admin/tiers/${a.assessment.tier.id}/pre-assessment/${a.id}`}
                          className="text-xs font-medium whitespace-nowrap text-primary-700 hover:text-primary-900"
                        >
                          Review →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Enrolments">
        {learner.enrollments.length === 0 && <p className="text-sm text-ink-400">No enrolments yet. This learner has registered but never started a checkout.</p>}
        <ul className="divide-y divide-line/70">
          {learner.enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900">
                  {e.tier.program.title} ({e.tier.name})
                </div>
                <div className="text-xs text-ink-400">
                  {e.source === "PAYSTACK" ? formatNaira(e.amount) : e.source === "ADMIN" ? "Granted by admin" : "Imported"} ·{" "}
                  {formatDay(e.createdAt)}
                  {e.activatedAt && ` · active since ${formatDay(e.activatedAt)}`}
                  {e.preAssessmentWaived && " · pre-assessment waived"}
                  {e.status === "ACTIVE" &&
                    !e.preAssessmentWaived &&
                    e.tier.modules.some((tm) => access.awaiting.has(tm.module.id)) && (
                      <span className="text-amber-700"> · some modules wait on a pre-assessment</span>
                    )}
                </div>
              </div>
              {e.status === "ACTIVE" && (
                <form action={setPreAssessmentWaiver.bind(null, e.id, !e.preAssessmentWaived)}>
                  <button type="submit" className="text-xs font-medium text-primary-700 hover:text-primary-900">
                    {e.preAssessmentWaived ? "Require pre-assessment" : "Waive pre-assessment"}
                  </button>
                </form>
              )}
              <StatusBadge status={e.status} />
              {e.status === "ACTIVE" && (
                <DeleteButton
                  onDelete={cancelEnrollment.bind(null, e.id)}
                  confirmText="Cancel this enrolment? The learner loses access to its modules."
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
                {t.program.title} ({t.name})
              </option>
            ))}
          </Select>
          <CheckCard
            name="waive"
            label="Skip pre-assessment"
            hint="Open its modules without the learner passing the tier's pre-assessment"
          />
        </ActionForm>
      </Panel>

      <p className="text-sm">
        <Link href={`/admin/activity?target=user:${learner.id}`} className="font-medium text-primary-700 hover:text-primary-900">
          Admin activity on this account →
        </Link>
      </p>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card min-w-0 p-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-3 font-display text-2xl leading-tight text-ink-950 tabular-nums">{children}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block font-sans text-xs leading-snug text-ink-500">{children}</span>;
}

function RollupLine({
  started,
  completed,
  elapsed,
  spentSec,
}: {
  started: Date | null;
  completed: Date | null;
  elapsed: number | null;
  spentSec: number;
}) {
  if (!started) return <p className="mt-1.5 text-xs text-ink-400">Not started</p>;
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-500">
      <span>Started {formatDate(started)}</span>
      {completed ? <span>Completed {formatDate(completed)}</span> : <span className="text-amber-700">Not finished</span>}
      {elapsed !== null && <span>Took {formatDuration(elapsed)}</span>}
      {spentSec > 0 && <span>Time spent {formatDuration(spentSec)}</span>}
    </p>
  );
}
