import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { gradeAnswers } from "@/lib/lms/quiz";
import { displayBlankPrompt } from "@/lib/lms/fill-blank";
import { PROCTOR_EVENTS, type ProctorEvent } from "@/lib/lms/proctoring";
import { cn, formatDate } from "@/lib/utils";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { ActionForm, Field, Panel, Textarea } from "@/components/admin/forms";
import { voidPreAssessmentAttempt } from "../../../../question-banks/actions";

export const metadata: Metadata = { title: "Pre-assessment attempt" };

const time = (d: Date | string) =>
  new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(d));

function duration(ms: number) {
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return m ? `${m} min ${s} s` : `${s} s`;
}

const END: Record<string, string> = {
  SUBMITTED: "Submitted",
  TIMED_OUT: "Time ran out",
  TERMINATED: "Ended: too many strikes",
};

/** One proctored attempt: result, proctoring timeline, webcam stills and answers, with a way to cancel the result. */
export default async function PreAssessmentAttemptPage({ params }: PageProps<"/admin/tiers/[id]/pre-assessment/[attemptId]">) {
  await requireAdmin();
  const { id, attemptId } = await params;
  const attempt = await prisma.preAssessmentAttempt.findFirst({
    where: { id: attemptId, assessment: { tierId: id } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      assessment: {
        select: {
          passMark: true,
          maxStrikes: true,
          tier: { select: { id: true, name: true, program: { select: { id: true, title: true } } } },
        },
      },
      snapshots: { orderBy: { takenAt: "asc" } },
    },
  });
  if (!attempt) notFound();
  const { tier } = attempt.assessment;

  const ids = attempt.questionIds as string[];
  const rows = await prisma.bankQuestion.findMany({ where: { id: { in: ids } } });
  const order = new Map(ids.map((qid, i) => [qid, i]));
  rows.sort((x, y) => order.get(x.id)! - order.get(y.id)!);
  const answers = (attempt.answers ?? {}) as Record<string, string[]>;
  const { graded } = gradeAnswers(rows, answers);
  const right = graded.filter((g) => g.isRight).length;

  const events = attempt.events as unknown as ProctorEvent[];
  const snapshots = isStorageConfigured()
    ? await Promise.all(attempt.snapshots.map(async (s) => ({ ...s, url: await presignDownload(s.key) })))
    : [];

  const result = attempt.voidedAt
    ? "Cancelled after review"
    : !attempt.submittedAt
      ? "In progress"
      : attempt.passed
        ? "Passed"
        : "Not passed";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Programmes", href: "/admin/programs" },
          { label: tier.program.title, href: `/admin/programs/${tier.program.id}` },
          { label: `${tier.name} pre-assessment`, href: `/admin/tiers/${tier.id}/pre-assessment` },
          { label: attempt.user.name },
        ]}
      />
      <PageHeader
        eyebrow="Pre-assessment attempt"
        title={attempt.user.name}
        description={`${attempt.user.email} · started ${formatDate(attempt.startedAt)}`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Webcam" description={snapshots.length ? `${snapshots.length} photos` : undefined}>
            {snapshots.length === 0 ? (
              <p className="text-sm text-ink-500">
                {attempt.snapshots.length ? "File storage isn't set up here, so photos can't be shown." : "No photos were taken."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {snapshots.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URLs */}
                      <img src={s.url} alt={`Webcam at ${time(s.takenAt)}`} className="aspect-[4/3] w-full bg-ink-900 object-cover" />
                    </a>
                    <span className="mt-1 block text-xs tabular-nums text-ink-500">{time(s.takenAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Answers" description={`${right} of ${graded.length} right`} flush>
            <ol className="divide-y divide-line">
              {graded.map(({ q, isRight }, i) => {
                const given = answers[q.id] ?? [];
                const options = (q.options as { id: string; text: string }[] | null) ?? [];
                const text = (optionIds: string[]) =>
                  q.type === "FILL_BLANK"
                    ? optionIds.join(" · ")
                    : optionIds.map((o) => options.find((x) => x.id === o)?.text ?? o).join(", ");
                return (
                  <li key={q.id} className="flex gap-3 px-5 py-3.5 text-sm sm:px-6">
                    {isRight ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-accent-600" />
                    )}
                    <div className="min-w-0">
                      <p className="whitespace-pre-line text-ink-900">
                        {i + 1}. {q.type === "FILL_BLANK" ? displayBlankPrompt(q.prompt) : q.prompt}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        Answered: {given.length ? text(given) : "—"}
                        {!isRight && <> · Correct: {text(q.correct as string[])}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="Result">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Score</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink-950">
                  {attempt.score ?? "—"}
                  {attempt.score !== null && "%"} <span className="text-xs font-normal text-ink-500">/ {attempt.assessment.passMark}%</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Result</dt>
                <dd className={cn("mt-0.5 font-medium", attempt.passed ? "text-emerald-700" : "text-ink-950")}>{result}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Strikes</dt>
                <dd className={cn("mt-0.5 font-medium tabular-nums", attempt.strikes ? "text-accent-700" : "text-ink-950")}>
                  {attempt.strikes}
                  {attempt.assessment.maxStrikes > 0 && ` / ${attempt.assessment.maxStrikes}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Ended</dt>
                <dd className="mt-0.5 text-ink-950">{attempt.endReason ? END[attempt.endReason] : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Time taken</dt>
                <dd className="mt-0.5 text-ink-950">
                  {attempt.submittedAt ? duration(attempt.submittedAt.getTime() - attempt.startedAt.getTime()) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">IP address</dt>
                <dd className="mt-0.5 break-all text-ink-950">{attempt.ip ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-ink-500">Browser</dt>
                <dd className="mt-0.5 text-xs break-words text-ink-700">{attempt.userAgent ?? "—"}</dd>
              </div>
            </dl>
            {attempt.voidedAt && (
              <p className="mt-4 rounded-xl bg-accent-50 px-3 py-2.5 text-xs leading-relaxed text-accent-900">
                Cancelled {formatDate(attempt.voidedAt)}: {attempt.voidReason}
              </p>
            )}
          </Panel>

          {attempt.submittedAt && !attempt.voidedAt && (
            <Panel
              title="Cancel this result"
              description="Use this if the photos or log show cheating. It counts as a failed attempt, and any modules it unlocked lock again."
            >
              <ActionForm action={voidPreAssessmentAttempt.bind(null, attempt.id)} submitLabel="Cancel result">
                <Field label="Reason" hint="Kept on record; the learner is told the result was cancelled after review">
                  <Textarea name="reason" rows={3} required maxLength={500} />
                </Field>
              </ActionForm>
            </Panel>
          )}

          <Panel title="Proctoring log" flush>
            <ol className="max-h-[32rem] divide-y divide-line overflow-y-auto">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3 px-5 py-2.5 text-sm">
                  <span className="w-16 shrink-0 text-xs tabular-nums text-ink-500">{time(e.at)}</span>
                  <span className={cn("min-w-0 flex-1", e.strike ? "text-accent-800" : "text-ink-700")}>
                    {PROCTOR_EVENTS[e.type]?.label ?? e.type}
                    {e.detail && <span className="text-ink-500"> ({e.detail})</span>}
                  </span>
                  {e.strike && (
                    <span className="h-5 shrink-0 rounded-full bg-accent-50 px-2 text-xs leading-5 font-medium text-accent-700">
                      Strike
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          <Link href={`/admin/learners/${attempt.user.id}`} className="block text-sm font-medium text-primary-700 hover:text-primary-900">
            View learner →
          </Link>
        </aside>
      </div>
    </div>
  );
}
