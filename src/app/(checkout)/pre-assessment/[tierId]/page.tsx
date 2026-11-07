import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, ClipboardCheck, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isEmailVerified, requireSession } from "@/lib/auth";
import { getAttemptQuestions, getPreAssessmentState } from "@/lib/lms/pre-assessment";
import { formatDate, formatNaira } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/content/site";
import { EnrollButton } from "../../enroll/EnrollButton";
import { startPreAssessment } from "./actions";
import { PreAssessmentPlayer, StartButton } from "./PreAssessmentPlayer";

export const metadata: Metadata = { title: "Pre-assessment" };

/**
 * A tier's entry test. Learners must pass it before checkout opens for the tier
 * (enforced again in /api/enroll).
 */
export default async function PreAssessmentPage({ params }: PageProps<"/pre-assessment/[tierId]">) {
  const { tierId } = await params;
  const session = await requireSession(`/pre-assessment/${tierId}`);

  const tier = await prisma.tier.findFirst({
    where: { id: tierId, published: true, program: { published: true } },
    select: { id: true, slug: true, name: true, price: true, program: { select: { slug: true, title: true } } },
  });
  if (!tier) notFound();
  const back = `/enroll?track=${encodeURIComponent(tier.program.slug)}&tier=${encodeURIComponent(tier.slug)}`;

  const enrolment = await prisma.enrollment.findUnique({
    where: { userId_tierId: { userId: session.userId, tierId } },
    select: { status: true },
  });
  if (enrolment?.status === "ACTIVE") redirect("/learn");

  const state = await getPreAssessmentState(session.userId, tierId);
  // Nothing to take (switched off, or no questions yet): straight on to checkout.
  if (!state) redirect(back);

  const { status } = state;
  const questions = status.kind === "in-progress" ? await getAttemptQuestions(session.userId, status.attemptId) : null;
  const verified = status.kind === "passed" ? await isEmailVerified(session.userId) : false;
  const attemptsLeft = state.maxAttempts === null ? null : Math.max(0, state.maxAttempts - state.attemptsUsed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> Back to plans
      </Link>

      <header className="mt-6">
        <div className="eyebrow">Pre-assessment</div>
        <h1 className="mt-3 font-display text-3xl leading-tight text-balance text-ink-950 sm:text-[2.4rem]">
          {tier.program.title}: {tier.name}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          Pass this short assessment to unlock enrolment in {tier.name} ({formatNaira(tier.price)}).
        </p>
      </header>

      <div className="mt-8">
        {status.kind === "passed" ? (
          <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
            <CheckCircle2 className="size-9 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-3xl leading-none tabular-nums text-ink-950">{status.score}%</p>
              <p className="mt-1.5 text-sm text-ink-600">You passed. Enrolment is now open to you.</p>
            </div>
            <div className="sm:w-56">
              {verified ? (
                <EnrollButton tierId={tier.id} label={`Pay ${formatNaira(tier.price)}`} />
              ) : (
                <ButtonLink
                  href={`/verify-email?next=${encodeURIComponent(back)}`}
                  size="lg"
                  className="w-full"
                >
                  Confirm your email to enrol
                </ButtonLink>
              )}
            </div>
          </div>
        ) : status.kind === "in-progress" && questions && questions.length > 0 ? (
          <>
            <p className="mb-5 text-sm text-ink-500">
              {questions.length} {questions.length === 1 ? "question" : "questions"} · pass mark {state.passMark}%. Your
              answers are marked when you submit.
            </p>
            <PreAssessmentPlayer tierId={tier.id} attemptId={status.attemptId} questions={questions} />
          </>
        ) : (
          <div className="card p-6 sm:p-7">
            {state.lastScore !== null && (
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-accent-200 bg-accent-50/70 p-4 text-accent-900">
                <XCircle className="size-7 shrink-0" />
                <div>
                  <p className="font-display text-2xl leading-none tabular-nums">{state.lastScore}%</p>
                  <p className="mt-1 text-sm opacity-80">Your last attempt. You need {state.passMark}% to pass.</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
                <ClipboardCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-ink-950">Before you start</h2>
                {state.instructions ? (
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-600">{state.instructions}</p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    Answer every question, then submit. Your answers are saved when you submit, so finish in one sitting.
                  </p>
                )}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-sm">
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Questions</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">{state.questionCount}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Pass mark</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">{state.passMark}%</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Attempts left</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">{attemptsLeft ?? "Unlimited"}</dd>
              </div>
            </dl>

            <div className="mt-6">
              {status.kind === "wait" ? (
                <p className="flex items-start gap-2 text-sm text-ink-600">
                  <Clock className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  You can try again from {formatDate(status.until)}.
                </p>
              ) : status.kind === "no-attempts" ? (
                <p className="text-sm text-ink-600">
                  You&apos;ve used all your attempts. If you think you should be able to enrol,{" "}
                  <a href={`mailto:${SITE.email}`} className="font-medium text-primary-700 underline underline-offset-2">
                    contact us
                  </a>
                  .
                </p>
              ) : (
                <form action={startPreAssessment.bind(null, tier.id)}>
                  <StartButton>
                    {state.lastScore !== null ? "Try again" : status.kind === "in-progress" ? "Continue" : "Start the assessment"}
                  </StartButton>
                  {state.retakeAfterHours > 0 && (state.maxAttempts === null || state.maxAttempts > 1) && (
                    <p className="mt-3 text-xs text-ink-500">
                      If you don&apos;t pass, you can retake it after {state.retakeAfterHours}{" "}
                      {state.retakeAfterHours === 1 ? "hour" : "hours"}.
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
