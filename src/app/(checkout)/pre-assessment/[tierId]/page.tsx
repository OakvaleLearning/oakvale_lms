import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, ClipboardCheck, ShieldCheck, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isEmailVerified, requireSession } from "@/lib/auth";
import { getModuleAccess, getOpenAttempt, getPreAssessmentState } from "@/lib/lms/pre-assessment";
import { formatDate, formatNaira } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/content/site";
import { EnrollButton } from "../../enroll/EnrollButton";
import { PreAssessmentPlayer, StartAssessment } from "./PreAssessmentPlayer";

export const metadata: Metadata = { title: "Pre-assessment" };

/** e.g. "45 seconds", "2 minutes", "1 min 30 s". */
function formatSeconds(s: number) {
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} ${m === 1 ? "minute" : "minutes"}`;
}

/**
 * A tier's proctored entry test. Learners must pass it before checkout opens
 * for the tier (enforced again in /api/enroll), and before the tier's modules
 * open to them in any plan that includes them (src/lib/lms/access.ts).
 */
export default async function PreAssessmentPage({ params }: PageProps<"/pre-assessment/[tierId]">) {
  const { tierId } = await params;
  const session = await requireSession(`/pre-assessment/${tierId}`);

  const tier = await prisma.tier.findFirst({
    where: { id: tierId, published: true, program: { published: true } },
    select: {
      id: true,
      slug: true,
      name: true,
      price: true,
      program: { select: { slug: true, title: true } },
      modules: { select: { moduleId: true } },
    },
  });
  if (!tier) notFound();
  const back = `/enroll?track=${encodeURIComponent(tier.program.slug)}&tier=${encodeURIComponent(tier.slug)}`;

  const [state, access] = await Promise.all([
    getPreAssessmentState(session.userId, tierId),
    getModuleAccess(session.userId),
  ]);
  // Learners who already hold these modules (e.g. in Full Programme) go to them once they're open.
  const holds = tier.modules.length > 0 && tier.modules.every((m) => access.open.has(m.moduleId) || access.awaiting.has(m.moduleId));
  const allOpen = tier.modules.length > 0 && tier.modules.every((m) => access.open.has(m.moduleId));
  // Nothing to take (switched off, or no questions yet): straight on to checkout or the modules.
  if (!state) redirect(holds ? "/learn" : back);

  const { status } = state;
  // Already in (an admin waived it, or they enrolled before it existed): nothing to do here.
  if (allOpen && status.kind !== "passed" && status.kind !== "in-progress") redirect("/learn");

  const attempt = status.kind === "in-progress" ? await getOpenAttempt(session.userId, status.attemptId) : null;
  // It ended just now (every question's time ran out): show the result instead.
  if (status.kind === "in-progress" && !attempt) redirect(`/pre-assessment/${tierId}`);
  const verified = status.kind === "passed" && !holds ? await isEmailVerified(session.userId) : false;
  const attemptsLeft = state.maxAttempts === null ? null : Math.max(0, state.maxAttempts - state.attemptsUsed);
  const last = state.last;

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
          {holds
            ? `Pass this assessment to unlock your ${tier.name} modules.`
            : `Pass this assessment to unlock enrolment in ${tier.name} (${formatNaira(tier.price)}).`}
        </p>
      </header>

      <div className="mt-8">
        {status.kind === "passed" ? (
          <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
            <CheckCircle2 className="size-9 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-3xl leading-none tabular-nums text-ink-950">{status.score}%</p>
              <p className="mt-1.5 text-sm text-ink-600">
                {holds ? "You passed. Your modules are now open." : "You passed. Enrolment is now open to you."}
              </p>
            </div>
            <div className="sm:w-56">
              {holds ? (
                <ButtonLink href="/learn" size="lg" className="w-full">
                  Go to my learning
                </ButtonLink>
              ) : verified ? (
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
        ) : status.kind === "in-progress" && attempt ? (
          <>
            <p className="mb-5 text-sm text-ink-500">
              {attempt.total} {attempt.total === 1 ? "question" : "questions"}, one at a time · pass mark {state.passMark}%.
              You can&apos;t go back to a question once you move on.
            </p>
            <PreAssessmentPlayer
              tierId={tier.id}
              initial={attempt}
              proctored={state.proctored}
              webcam={state.webcam}
              maxStrikes={state.maxStrikes}
              secondsPerQuestion={state.secondsPerQuestion}
            />
          </>
        ) : (
          <div className="card p-6 sm:p-7">
            {last && (
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-accent-200 bg-accent-50/70 p-4 text-accent-900">
                <XCircle className="size-7 shrink-0" />
                <div>
                  <p className="font-display text-2xl leading-none tabular-nums">
                    {last.endReason === "TERMINATED" || last.voided ? "Not passed" : `${last.score}%`}
                  </p>
                  <p className="mt-1 text-sm opacity-80">
                    {last.voided
                      ? "Your last result was cancelled after review."
                      : last.endReason === "TERMINATED"
                        ? `Your last attempt was ended after ${last.strikes} proctoring strikes.`
                        : last.endReason === "TIMED_OUT"
                          ? `Time ran out on your last attempt. You need ${state.passMark}% to pass.`
                          : `Your last attempt. You need ${state.passMark}% to pass.`}
                  </p>
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
                    Find a quiet place where you won&apos;t be interrupted, and finish in one sitting.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-ink-50 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <ShieldCheck className="size-4 text-primary-600" />{" "}
                  {state.proctored || state.webcam ? "This assessment is proctored" : "How it works"}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-600">
                  {state.timeLimitMinutes && (
                    <li>
                      You have {state.timeLimitMinutes} minutes. The timer keeps running if you leave, and when it runs out
                      your saved answers are marked.
                    </li>
                  )}
                  {state.proctored && (
                    <>
                      <li>It runs in full screen. Stay on this page until you submit.</li>
                      <li>
                        Leaving the page, switching to another window or app, leaving full screen, copying, pasting, or
                        opening it in a second tab or device each count as a strike.
                        {state.maxStrikes > 0 &&
                          ` On ${state.maxStrikes} ${state.maxStrikes === 1 ? "strike" : "strikes"} the attempt ends and counts as a fail.`}
                      </li>
                    </>
                  )}
                  {state.webcam && (
                    <li>Your camera stays on, and photos are taken during the assessment for our team to review.</li>
                  )}
                  <li>
                    Questions come one at a time, and you can&apos;t go back to one once you move on.
                    {state.secondsPerQuestion &&
                      ` Each question has ${formatSeconds(state.secondsPerQuestion)}; when that runs out you move to the next one automatically.`}
                  </li>
                  <li>Every attempt has new questions. Results can be cancelled after review.</li>
                </ul>
            </div>

            <dl className="mt-6 grid grid-cols-2 divide-line rounded-xl border border-line text-sm sm:grid-cols-4 sm:divide-x">
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Questions</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">{state.questionCount}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Pass mark</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">{state.passMark}%</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-ink-500">Time limit</dt>
                <dd className="mt-1 font-medium tabular-nums text-ink-950">
                  {state.timeLimitMinutes ? `${state.timeLimitMinutes} min` : "None"}
                </dd>
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
              ) : status.kind === "no-questions" ? (
                <p className="text-sm text-ink-600">
                  Every attempt uses questions you haven&apos;t seen before, and there aren&apos;t enough new ones for
                  another attempt yet. Please{" "}
                  <a href={`mailto:${SITE.email}`} className="font-medium text-primary-700 underline underline-offset-2">
                    contact us
                  </a>
                  .
                </p>
              ) : (
                <>
                  <StartAssessment
                    tierId={tier.id}
                    label={last ? "Try again" : status.kind === "in-progress" ? "Continue" : "Start the assessment"}
                    proctored={state.proctored}
                    webcam={state.webcam}
                  />
                  {state.retakeAfterHours > 0 && (state.maxAttempts === null || state.maxAttempts > 1) && (
                    <p className="mt-3 text-xs text-ink-500">
                      If you don&apos;t pass, you can retake it after {state.retakeAfterHours}{" "}
                      {state.retakeAfterHours === 1 ? "hour" : "hours"}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
