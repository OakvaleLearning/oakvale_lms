import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { cn, formatDate } from "@/lib/utils";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { buttonClass } from "@/components/ui/Button";
import { ActionForm, CheckCard, DeleteButton, Field, Input, Panel, Switch, Textarea } from "@/components/admin/forms";
import { resetPreAssessmentAttempts, updatePreAssessment } from "../../../question-banks/actions";

export const metadata: Metadata = { title: "Pre-assessment" };

function resultLabel(r: { passed: boolean; endReason: string | null; voidedAt: Date | null; resetAt: Date | null }) {
  if (r.voidedAt) return "Cancelled after review";
  if (r.resetAt) return "Reset";
  if (r.endReason === "TERMINATED") return "Ended: too many strikes";
  if (r.endReason === "TIMED_OUT") return r.passed ? "Passed (time ran out)" : "Time ran out";
  return r.passed ? "Passed" : "Not passed";
}

export default async function TierPreAssessmentPage({ params }: PageProps<"/admin/tiers/[id]/pre-assessment">) {
  await requireAdmin();
  const { id } = await params;
  const tier = await prisma.tier.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      program: { select: { id: true, title: true } },
      preAssessment: {
        include: {
          banks: { select: { id: true } },
          attempts: {
            where: { submittedAt: { not: null } },
            orderBy: { submittedAt: "desc" },
            take: 300,
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!tier) notFound();

  const banks = await prisma.questionBank.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, _count: { select: { questions: true } } },
  });

  const a = tier.preAssessment;
  const chosen = new Set(a?.banks.map((b) => b.id));
  const pool = banks.filter((b) => chosen.has(b.id)).reduce((n, b) => n + b._count.questions, 0);

  const rows = a?.attempts ?? [];
  const learners = new Set(rows.map((r) => r.userId));
  const passedBy = new Set(rows.filter((r) => r.passed).map((r) => r.userId));
  // Reset goes on each learner's latest counted attempt, while they haven't passed.
  const resettable = new Set<string>();
  const seenLearner = new Set<string>();
  for (const r of rows) {
    if (r.resetAt || seenLearner.has(r.userId)) continue;
    seenLearner.add(r.userId);
    if (!passedBy.has(r.userId)) resettable.add(r.id);
  }
  // Retakes never repeat a question, so the banks cap how many attempts a learner can have.
  const perAttempt = Math.min(a?.questionCount ?? 20, pool);
  const capacity = perAttempt > 0 ? Math.floor(pool / perAttempt) : 0;
  const storage = isStorageConfigured();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Programmes", href: "/admin/programs" },
          { label: tier.program.title, href: `/admin/programs/${tier.program.id}` },
          { label: `${tier.name} pre-assessment` },
        ]}
      />
      <PageHeader
        eyebrow="Pre-assessment"
        title={tier.name}
        description="While this is on, learners must pass it before they can pay for this tier, and before its modules open in any plan that includes them (e.g. Full Programme). Enrolments you grant with “Skip pre-assessment” bypass it."
        actions={
          a?.enabled && pool > 0 ? (
            <a href={`/pre-assessment/${tier.id}`} target="_blank" className={buttonClass({ variant: "outline", size: "sm" })}>
              Learner view <ExternalLink className="size-3.5" />
            </a>
          ) : null
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Attempts"
          description={rows.length ? `${learners.size} ${learners.size === 1 ? "learner" : "learners"} · ${passedBy.size} passed` : undefined}
          flush
        >
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-500">No one has taken it yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs text-ink-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium sm:px-6">Learner</th>
                    <th className="px-3 py-2.5 font-medium">Result</th>
                    <th className="px-3 py-2.5 font-medium">Strikes</th>
                    <th className="hidden px-3 py-2.5 font-medium md:table-cell">Finished</th>
                    <th className="px-5 py-2.5 sm:px-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className={cn(r.resetAt && "opacity-60")}>
                      <td className="px-5 py-3 sm:px-6">
                        <Link href={`/admin/learners/${r.user.id}`} className="font-medium text-ink-950 hover:text-primary-700">
                          {r.user.name}
                        </Link>
                        <span className="block text-xs text-ink-500">{r.user.email}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <span className={cn("font-medium", r.passed ? "text-emerald-700" : "text-ink-900")}>{r.score ?? 0}%</span>
                        <span className={cn("block text-xs", r.passed ? "text-emerald-700" : "text-ink-500")}>
                          {resultLabel(r)}
                        </span>
                      </td>
                      <td className={cn("px-3 py-3 tabular-nums", r.strikes > 0 ? "text-accent-700" : "text-ink-600")}>{r.strikes}</td>
                      <td className="hidden px-3 py-3 text-ink-600 md:table-cell">{formatDate(r.submittedAt!)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap sm:px-6">
                        <Link
                          href={`/admin/tiers/${tier.id}/pre-assessment/${r.id}`}
                          className="text-sm font-medium text-primary-700 hover:text-primary-900"
                        >
                          Review
                        </Link>
                        {resettable.has(r.id) && (
                          <span className="ml-3 inline-block">
                            <DeleteButton
                              onDelete={resetPreAssessmentAttempts.bind(null, tier.id, r.user.id)}
                              confirmText={`Clear ${r.user.name}'s attempts so they can start again? Their next attempts still won't repeat any question they've seen.`}
                              label="Reset"
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="Settings">
            <ActionForm action={updatePreAssessment.bind(null, tier.id)}>
              <Switch
                name="enabled"
                label="Require a pre-assessment"
                description="Learners must pass it before checkout opens"
                defaultChecked={a?.enabled ?? false}
              />
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink-800">Question banks</legend>
                {banks.length === 0 ? (
                  <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
                    <Link href="/admin/question-banks" className="font-medium text-primary-700">
                      Create a question bank
                    </Link>{" "}
                    first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {banks.map((b) => (
                      <CheckCard
                        key={b.id}
                        name="bankIds"
                        value={b.id}
                        label={b.title}
                        hint={`${b._count.questions} ${b._count.questions === 1 ? "question" : "questions"}`}
                        defaultChecked={chosen.has(b.id)}
                      />
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Questions per attempt"
                  hint={pool ? `Spread evenly across the banks, never repeated for a learner (${pool} in total)` : undefined}
                >
                  <Input name="questionCount" type="number" min={1} max={200} required defaultValue={a?.questionCount ?? 20} />
                </Field>
                <Field label="Pass mark (%)">
                  <Input name="passMark" type="number" min={0} max={100} required defaultValue={a?.passMark ?? 70} />
                </Field>
                <Field label="Max attempts" hint="Empty = unlimited">
                  <Input name="maxAttempts" type="number" min={1} max={100} defaultValue={a?.maxAttempts ?? ""} />
                </Field>
                <Field label="Wait to retake (hours)" hint="0 = straight away">
                  <Input name="retakeAfterHours" type="number" min={0} max={720} defaultValue={a?.retakeAfterHours ?? 24} />
                </Field>
              </div>
              {pool > 0 && (
                <p
                  className={cn(
                    "flex gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                    a?.maxAttempts && a.maxAttempts <= capacity ? "bg-ink-50 text-ink-600" : "bg-amber-50 text-amber-900"
                  )}
                >
                  {!(a?.maxAttempts && a.maxAttempts <= capacity) && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                  <span>
                    Enough questions for {capacity} {capacity === 1 ? "attempt" : "attempts"} per learner without repeats.
                    {!(a?.maxAttempts && a.maxAttempts <= capacity) &&
                      ` After that, learners can't start another until you add questions. Set max attempts to ${capacity} or fewer.`}
                  </span>
                </p>
              )}
              <fieldset className="space-y-3 border-t border-line pt-4">
                <legend className="sr-only">Proctoring</legend>
                <Field label="Time limit (minutes)" hint="Empty = untimed. Enforced on the server.">
                  <Input name="timeLimitMinutes" type="number" min={1} max={600} defaultValue={a ? (a.timeLimitMinutes ?? "") : 60} />
                </Field>
                <Switch
                  name="proctored"
                  label="Proctored"
                  description="Full screen, one tab or device, no copy or paste. Leaving the page counts as a strike."
                  defaultChecked={a?.proctored ?? true}
                />
                <Field label="End the attempt on this many strikes" hint="0 = record strikes but never end it">
                  <Input name="maxStrikes" type="number" min={0} max={50} defaultValue={a?.maxStrikes ?? 3} />
                </Field>
                <Switch
                  name="webcam"
                  label="Webcam"
                  description={
                    storage
                      ? "Camera must stay on. A photo is taken about every minute for review."
                      : "File storage isn't set up here, so the camera won't be required."
                  }
                  defaultChecked={a?.webcam ?? true}
                />
              </fieldset>
              <Field label="Instructions" optional hint="Shown before learners start">
                <Textarea name="instructions" rows={4} defaultValue={a?.instructions ?? ""} />
              </Field>
            </ActionForm>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
