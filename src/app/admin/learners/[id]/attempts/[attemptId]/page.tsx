import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { gradeAnswers } from "@/lib/lms/quiz";
import { displayBlankPrompt } from "@/lib/lms/fill-blank";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { Panel } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Quiz attempt" };

/** One lesson-quiz or final-assessment attempt: the recorded result and each answer. */
export default async function QuizAttemptPage({ params }: PageProps<"/admin/learners/[id]/attempts/[attemptId]">) {
  await requireAdmin();
  const { id, attemptId } = await params;
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, userId: id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      quiz: {
        include: {
          questions: { orderBy: { order: "asc" } },
          lesson: { select: { title: true, topic: { select: { title: true, module: { select: { title: true } } } } } },
        },
      },
    },
  });
  if (!attempt) notFound();
  const { quiz } = attempt;
  const number = await prisma.quizAttempt.count({
    where: { quizId: quiz.id, userId: id, createdAt: { lte: attempt.createdAt } },
  });

  const answers = (attempt.answers ?? {}) as Record<string, string[]>;
  // Answers are marked against the questions as they are now; the score above is what was recorded at the time.
  const { graded } = gradeAnswers(quiz.questions, answers);
  const right = graded.filter((g) => g.isRight).length;
  const removed = Object.keys(answers).filter((qid) => !quiz.questions.some((q) => q.id === qid)).length;
  const edited = quiz.questions.some((q) => !(q.id in answers)) || removed > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Learners", href: "/admin/learners" },
          { label: attempt.user.name, href: `/admin/learners/${attempt.user.id}` },
          { label: `${quiz.lesson.title}, attempt ${number}` },
        ]}
      />
      <PageHeader
        eyebrow={quiz.kind === "EXAM" ? "Final assessment attempt" : "Quiz attempt"}
        title={quiz.lesson.title}
        description={`${attempt.user.name} · ${quiz.lesson.topic.module.title} · ${quiz.lesson.topic.title} · attempt ${number}`}
      />

      <Panel title="Result">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-500">Score</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink-950">
              {attempt.score}% <span className="text-xs font-normal text-ink-500">/ {quiz.passMark}%</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Result</dt>
            <dd className={cn("mt-0.5 font-medium", attempt.passed ? "text-emerald-700" : "text-accent-700")}>
              {attempt.passed ? "Passed" : "Not passed"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Time taken</dt>
            <dd className="mt-0.5 text-ink-950">{attempt.durationSec === null ? "Not recorded" : formatDuration(attempt.durationSec)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Submitted</dt>
            <dd className="mt-0.5 text-ink-950">{formatDate(attempt.createdAt)}</dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Answers"
        description={
          edited
            ? `${right} of ${graded.length} right against the current questions. The quiz has changed since this attempt, so this may differ from the recorded score.`
            : `${right} of ${graded.length} right`
        }
        flush
      >
        <ol className="divide-y divide-line">
          {graded.map(({ q, isRight }, i) => {
            const given = answers[q.id] ?? [];
            const options = (q.options as { id: string; text: string }[] | null) ?? [];
            const text = (optionIds: string[]) =>
              q.type === "FILL_BLANK"
                ? optionIds.map((o) => o.split("|")[0]).join(" · ")
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
                    Answered: {given.length ? (q.type === "FILL_BLANK" ? given.join(" · ") : text(given)) : "—"}
                    {!isRight && <> · Correct: {text(q.correct as string[])}</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {removed > 0 && (
          <p className="border-t border-line px-5 py-3 text-xs text-ink-500 sm:px-6">
            {removed} {removed === 1 ? "answer is" : "answers are"} to questions that have since been removed.
          </p>
        )}
      </Panel>
    </div>
  );
}
