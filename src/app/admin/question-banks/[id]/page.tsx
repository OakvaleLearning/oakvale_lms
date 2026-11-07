import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { displayBlankPrompt } from "@/lib/lms/fill-blank";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { ActionForm, DeleteButton, Field, Input, MoveButtons, Panel, Select, Textarea } from "@/components/admin/forms";
import { QuestionEditor, type EditableQuestion } from "@/components/admin/QuestionEditor";
import { moveItem } from "../../actions";
import { deleteBank, deleteBankQuestion, importQuizQuestions, saveBankQuestion, updateBank } from "../actions";

export const metadata: Metadata = { title: "Question bank" };

const QUESTION_TYPE: Record<EditableQuestion["type"], string> = {
  SINGLE: "Single answer",
  MULTIPLE: "Multiple answers",
  TRUE_FALSE: "True / False",
  FILL_BLANK: "Fill in the blanks",
};

const EXPLANATION_HINT = "For your reference. Pre-assessments never show learners the answers. Optional.";

export default async function QuestionBankPage({ params }: PageProps<"/admin/question-banks/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: {
      questions: { orderBy: [{ order: "asc" }, { id: "asc" }] },
      assessments: {
        select: {
          enabled: true,
          questionCount: true,
          tier: { select: { id: true, name: true, program: { select: { id: true, title: true } } } },
        },
      },
    },
  });
  if (!bank) notFound();

  const quizzes = await prisma.quiz.findMany({
    where: { questions: { some: {} } },
    select: {
      lessonId: true,
      kind: true,
      _count: { select: { questions: true } },
      lesson: { select: { title: true, topic: { select: { module: { select: { title: true } } } } } },
    },
    orderBy: { lesson: { title: "asc" } },
  });

  const questions = bank.questions as unknown as EditableQuestion[];
  const save = saveBankQuestion.bind(null, bank.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Question banks", href: "/admin/question-banks" }, { label: bank.title }]} />
      <PageHeader
        eyebrow="Question bank"
        title={bank.title}
        description={`${questions.length} ${questions.length === 1 ? "question" : "questions"}`}
        actions={
          <DeleteButton
            onDelete={deleteBank.bind(null, bank.id)}
            confirmText={`Delete “${bank.title}” and all of its questions?`}
            label="Delete"
          />
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Questions"
          description="Each pre-assessment attempt draws its questions at random from here. Learners see their score, never the answers."
        >
          <div className="space-y-3">
            {questions.map((q, i) => (
              <details key={q.id} className="group rounded-xl border border-line bg-white open:shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-2 py-2 pl-2 pr-3 [&::-webkit-details-marker]:hidden">
                  <MoveButtons onMove={moveItem.bind(null, "bankQuestion", q.id)} />
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-50 text-xs font-semibold text-primary-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                    {q.type === "FILL_BLANK" ? displayBlankPrompt(q.prompt) : q.prompt}
                  </span>
                  <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">{QUESTION_TYPE[q.type]}</span>
                  <ChevronDown className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line p-4 sm:p-5">
                  <QuestionEditor save={save} question={q} explanationHint={EXPLANATION_HINT} />
                  <div className="mt-4 flex justify-end border-t border-line pt-3">
                    <DeleteButton
                      onDelete={deleteBankQuestion.bind(null, bank.id, q.id)}
                      confirmText="Delete this question?"
                      label="Delete question"
                    />
                  </div>
                </div>
              </details>
            ))}
            <details
              className="group rounded-xl border border-dashed border-ink-200 bg-canvas/50 open:border-solid open:bg-white"
              open={questions.length === 0}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-primary-700 [&::-webkit-details-marker]:hidden">
                <Plus className="size-4" /> Add a question
              </summary>
              <div className="border-t border-line p-4 sm:p-5">
                <QuestionEditor save={save} explanationHint={EXPLANATION_HINT} />
              </div>
            </details>
          </div>
        </Panel>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="Details">
            <ActionForm action={updateBank.bind(null, bank.id)}>
              <Field label="Title">
                <Input name="title" required defaultValue={bank.title} />
              </Field>
              <Field label="Description" optional>
                <Textarea name="description" rows={3} defaultValue={bank.description} />
              </Field>
            </ActionForm>
          </Panel>

          <Panel title="Used by">
            {bank.assessments.length === 0 ? (
              <p className="text-sm text-ink-500">
                No pre-assessment uses this bank yet. Choose it under a tier on its{" "}
                <Link href="/admin/programs" className="font-medium text-primary-700 hover:text-primary-900">
                  programme page
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bank.assessments.map((a) => (
                  <li key={a.tier.id}>
                    <Link
                      href={`/admin/tiers/${a.tier.id}/pre-assessment`}
                      className="font-medium text-primary-700 hover:text-primary-900"
                    >
                      {a.tier.program.title}: {a.tier.name}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {a.enabled ? `On · ${a.questionCount} questions per attempt` : "Switched off"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Copy from a quiz" description="Adds every question of a lesson quiz or final assessment to this bank.">
            {quizzes.length === 0 ? (
              <p className="text-sm text-ink-500">No lesson quizzes have questions yet.</p>
            ) : (
              <ActionForm action={importQuizQuestions.bind(null, bank.id)} submitLabel="Copy questions">
                <Field label="Quiz">
                  <Select name="lessonId" required defaultValue="">
                    <option value="" disabled>
                      Choose a quiz
                    </option>
                    {quizzes.map((q) => (
                      <option key={q.lessonId} value={q.lessonId}>
                        {q.lesson.topic.module.title}: {q.lesson.title}
                        {q.kind === "EXAM" ? " (final assessment)" : ""} · {q._count.questions}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
