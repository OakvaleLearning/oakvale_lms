import type { Metadata } from "next";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { consumeEmailVerificationToken, getSession, isEmailVerified } from "@/lib/auth";
import { safeNextPath } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { ResendVerificationButton } from "@/components/auth/VerifyEmail";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/** Opened from the sign-up email: confirms the address the link was sent to. */
export default async function ConfirmEmailPage({ searchParams }: PageProps<"/verify-email/confirm">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const next = safeNextPath(params.next);
  const [user, session] = await Promise.all([consumeEmailVerificationToken(token), getSession()]);
  // Opening the link a second time, already confirmed: nothing to fix.
  const confirmed = user ?? (session && (await isEmailVerified(session.userId)) ? { email: session.email } : null);

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:py-20">
      <div className="card p-7 text-center sm:p-9">
        {confirmed ? (
          <>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </span>
            <h1 className="mt-6 font-display text-3xl leading-tight text-ink-950">Email confirmed</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
              Thanks, <strong className="font-semibold text-ink-900">{confirmed.email}</strong> is confirmed.{" "}
              {next?.startsWith("/enroll") ? "You can now choose your plan and enrol." : "You're all set."}
            </p>
            <ButtonLink
              href={session ? (next ?? "/learn") : `/login?next=${encodeURIComponent(next ?? "/learn")}`}
              size="lg"
              className="mt-7 w-full"
            >
              {session ? "Continue" : "Log in to continue"}
            </ButtonLink>
          </>
        ) : (
          <>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-600">
              <CircleAlert className="size-6" />
            </span>
            <h1 className="mt-6 font-display text-3xl leading-tight text-ink-950">This link has expired</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
              It may have been used already, or a newer link was sent. {session ? "Send yourself a new one:" : "Log in and we'll send you a new one."}
            </p>
            {session ? (
              <ResendVerificationButton next={next} variant="primary" className="mt-7 flex flex-col items-center" />
            ) : (
              <ButtonLink href="/login?next=/verify-email" size="lg" className="mt-7 w-full">
                Log in
              </ButtonLink>
            )}
          </>
        )}
      </div>
    </div>
  );
}
