import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { buttonClass } from "@/components/ui/Button";
import { ActionForm, CheckCard, DeleteButton, Field, Input, Panel, Switch, Textarea } from "@/components/admin/forms";
import { resetPreAssessmentAttempts, updatePreAssessment } from "../../../question-banks/actions";

export const metadata: Metadata = { title: "Pre-assessment" };

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

  // One row per learner: their attempts, best score and whether they passed.
  const learners = new Map<
    string,
    { user: { id: string; name: string; email: string }; attempts: number; best: number; passed: boolean; last: Date }
  >();
  for (const at of a?.attempts ?? []) {
    const row = learners.get(at.userId);
    if (row) {
      row.attempts += 1;
      row.best = Math.max(row.best, at.score ?? 0);
      row.passed ||= at.passed;
    } else {
      learners.set(at.userId, { user: at.user, attempts: 1, best: at.score ?? 0, passed: at.passed, last: at.submittedAt! });
    }
  }
  const rows = [...learners.values()];
  const passedCount = rows.filter((r) => r.passed).length;

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
        description="While this is on, learners must pass it before they can pay for this tier. Enrolments you grant by hand skip it."
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
          title="Results"
          description={rows.length ? `${rows.length} ${rows.length === 1 ? "learner" : "learners"} · ${passedCount} passed` : undefined}
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
                    <th className="px-3 py-2.5 font-medium">Best</th>
                    <th className="px-3 py-2.5 font-medium">Attempts</th>
                    <th className="hidden px-3 py-2.5 font-medium md:table-cell">Last attempt</th>
                    <th className="px-5 py-2.5 sm:px-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.user.id}>
                      <td className="px-5 py-3 sm:px-6">
                        <Link href={`/admin/learners/${r.user.id}`} className="font-medium text-ink-950 hover:text-primary-700">
                          {r.user.name}
                        </Link>
                        <span className="block text-xs text-ink-500">{r.user.email}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        <span className={cn("font-medium", r.passed ? "text-emerald-700" : "text-ink-900")}>{r.best}%</span>
                        {r.passed && <span className="ml-1.5 text-xs text-emerald-700">Passed</span>}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">{r.attempts}</td>
                      <td className="hidden px-3 py-3 text-ink-600 md:table-cell">{formatDate(r.last)}</td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        {!r.passed && (
                          <DeleteButton
                            onDelete={resetPreAssessmentAttempts.bind(null, tier.id, r.user.id)}
                            confirmText={`Clear ${r.user.name}'s attempts so they can start again?`}
                            label="Reset"
                          />
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
                <Field label="Questions per attempt" hint={pool ? `Drawn at random, spread evenly across the banks (${pool} in total)` : undefined}>
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
