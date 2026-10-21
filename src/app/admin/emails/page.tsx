import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { formatLaunchDate, isPrelaunch } from "@/lib/launch";
import { enrolmentConfirmedEmail } from "@/lib/email-templates";
import { TEMPLATES, previewLearner, sequenceStats } from "@/lib/email-sequence";
import { PageHeader } from "@/components/dashboard/ui";
import { TestEmailButton } from "@/components/admin/TestEmailButton";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Automated emails" };

const EMAILS = [
  { key: "enrolment-confirmed", name: "1. You're in", when: "Straight after a successful payment (before launch)" },
  { key: "prelaunch-care", name: "2. A future around care", when: "About 2 days after enrolling, until launch eve" },
  { key: "prelaunch-toolkit", name: "3. Your toolkit", when: "About 4 days after enrolling (2+ days after email 2), until launch eve" },
  { key: "launch-eve", name: "4. Learning starts tomorrow", when: "The day before launch, to every enrolled learner" },
] as const;

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const session = await requireAdmin();
  const { email: selectedParam } = await searchParams;
  const selected = EMAILS.find((e) => e.key === selectedParam) ?? EMAILS[0];

  const [learner, stats, confirmedCount] = await Promise.all([
    previewLearner({ name: session.name, email: session.email }),
    sequenceStats(),
    prisma.enrollment.count({ where: { enrolledEmailSentAt: { not: null } } }),
  ]);
  const sentCount = (key: string) => (key === "enrolment-confirmed" ? confirmedCount : stats[key as keyof typeof stats]);
  const rendered =
    selected.key === "enrolment-confirmed"
      ? enrolmentConfirmedEmail(learner, learner.enrolments[0])
      : TEMPLATES[selected.key](learner);
  const configured = isEmailConfigured();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Communication"
        title="Automated emails"
        description={`The pre-launch sequence learners receive before opening day, ${formatLaunchDate()}.`}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={cn("rounded-full px-2.5 py-1 font-medium", configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
          {configured ? "Sending is on" : "Sending is off — set RESEND_API_KEY"}
        </span>
        <span className={cn("rounded-full px-2.5 py-1 font-medium", isPrelaunch() ? "bg-primary-50 text-primary-700" : "bg-ink-100 text-ink-600")}>
          {isPrelaunch() ? "Pre-launch mode on" : "Pre-launch mode off — emails 1–3 won't send"}
        </span>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-600">Checked daily at 8am (Lagos)</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="card overflow-hidden" aria-label="Emails">
          <ul>
            {EMAILS.map((e) => {
              const active = e.key === selected.key;
              return (
                <li key={e.key} className="border-b border-line/70 last:border-0">
                  <Link
                    href={`/admin/emails?email=${e.key}`}
                    aria-current={active ? "page" : undefined}
                    className={cn("relative block px-4 py-3.5 transition-colors", active ? "bg-primary-50/70" : "hover:bg-canvas")}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary-600" />}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-950">{e.name}</span>
                      <span className="text-xs tabular-nums text-ink-500">{sentCount(e.key)} sent</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{e.when}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-ink-500">
                <Clock className="size-3.5" /> {selected.when}
              </div>
              <div className="mt-1.5 flex items-start gap-2 text-sm font-medium text-ink-950">
                <Mail className="mt-0.5 size-4 shrink-0 text-ink-400" />
                {rendered.subject}
              </div>
            </div>
            <TestEmailButton key={selected.key} emailKey={selected.key} disabled={!configured} />
          </header>
          <iframe
            title={`Preview: ${rendered.subject}`}
            srcDoc={rendered.html}
            sandbox=""
            className="h-[70vh] w-full bg-[#f4f4f5]"
          />
          <p className="border-t border-line px-5 py-3 text-xs text-ink-500">
            Preview uses your name and email
            {learner.enrolments[0] ? `, with a ${learner.enrolments[0].programTitle} enrolment` : ""}. Learners see their own details.
          </p>
        </section>
      </div>
    </div>
  );
}
