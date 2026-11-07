import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { ActionForm, Dialog, Field, Input, Panel, Textarea } from "@/components/admin/forms";
import { createBank } from "./actions";

export const metadata: Metadata = { title: "Question banks" };

function NewBankDialog() {
  return (
    <Dialog
      title="New question bank"
      description="Add questions next, then choose this bank in a tier's pre-assessment."
      trigger={
        <>
          <Plus className="size-4" /> New bank
        </>
      }
    >
      <ActionForm action={createBank} submitLabel="Create bank" footerClassName="justify-end">
        <Field label="Title">
          <Input name="title" required placeholder="e.g. Care basics" />
        </Field>
        <Field label="Description" optional>
          <Textarea name="description" rows={3} placeholder="What these questions check" />
        </Field>
      </ActionForm>
    </Dialog>
  );
}

export default async function QuestionBanksPage() {
  await requireAdmin();
  const banks = await prisma.questionBank.findMany({
    orderBy: { title: "asc" },
    include: {
      _count: { select: { questions: true } },
      assessments: { select: { enabled: true, tier: { select: { name: true, program: { select: { title: true } } } } } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Pre-assessments"
        title="Question banks"
        description="Pools of questions for tier pre-assessments. Each attempt draws its questions at random from the banks a tier uses, and learners must pass before they can pay."
        actions={banks.length > 0 && <NewBankDialog />}
      />

      {banks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No question banks yet" action={<NewBankDialog />}>
          Create a bank, add questions to it, then switch on a pre-assessment for a tier from its programme page.
        </EmptyState>
      ) : (
        <Panel title="Banks" description={`${banks.length} ${banks.length === 1 ? "bank" : "banks"}`} flush>
          <ul className="divide-y divide-line">
            {banks.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/question-banks/${b.id}`}
                  className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-canvas sm:px-6"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600">
                    <ClipboardList className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-950 sm:truncate">{b.title}</span>
                    <span className="block text-xs text-ink-500">
                      {b._count.questions} {b._count.questions === 1 ? "question" : "questions"}
                      {b.assessments.length > 0
                        ? ` · used by ${b.assessments.map((a) => `${a.tier.program.title}: ${a.tier.name}${a.enabled ? "" : " (off)"}`).join(", ")}`
                        : " · not used yet"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
