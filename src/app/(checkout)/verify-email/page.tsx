import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/utils";
import { ResendVerificationButton, SwitchAccountButton } from "@/components/auth/VerifyEmail";

export const metadata: Metadata = { title: "Confirm your email" };

/** "Check your inbox" after sign-up, and where unverified learners are sent before paying or learning. */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const session = await requireSession(`/verify-email${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, role: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt || user.role === "ADMIN") redirect(next ?? "/learn");

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:py-20">
      <div className="card p-7 sm:p-9">
        <span className="grid size-12 place-items-center rounded-xl bg-primary-50 text-primary-600">
          <MailCheck className="size-6" />
        </span>
        <div className="eyebrow mt-6">Step 2 · Confirm your email</div>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink-950">Check your inbox</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
          We&apos;ve sent a link to <strong className="font-semibold text-ink-900">{user.email}</strong>. Click it to confirm
          your email, then you can enrol and start learning.
        </p>
        <ResendVerificationButton next={next} className="mt-7" />
        <p className="mt-7 border-t border-line pt-5 text-sm leading-relaxed text-ink-500">
          Can&apos;t find it? Check your spam or promotions folder. The link lasts 24 hours. Wrong address? You can{" "}
          <SwitchAccountButton />.
        </p>
      </div>
    </div>
  );
}
