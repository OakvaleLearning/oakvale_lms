import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, GraduationCap, Layers, Rocket, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/dashboard/ui";
import { ButtonLink } from "@/components/ui/Button";
import { Stagger, StaggerItem } from "@/components/motion";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { LaunchEmailButton } from "@/components/admin/LaunchEmailButton";
import { isPrelaunch } from "@/lib/launch";
import { countLaunchEmailsPending } from "./launch-actions";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverview() {
  await requireAdmin();
  const prelaunch = isPrelaunch();
  const [learners, activeEnrolments, programs, revenue, completions, recent, launchPending] = await Promise.all([
    prisma.user.count({ where: { role: "LEARNER" } }),
    prisma.enrollment.count({ where: { status: "ACTIVE" } }),
    prisma.program.count(),
    prisma.payment.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    prisma.lessonProgress.count({ where: { status: "COMPLETED" } }),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } }, enrollment: { include: { tier: { include: { program: true } } } } },
    }),
    countLaunchEmailsPending(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description="Enrolments, revenue and learner activity across Oakvale."
        actions={
          <ButtonLink href="/admin/programs" variant="outline" size="sm">
            Manage programmes
          </ButtonLink>
        }
      />

      {prelaunch ? (
        <div className="flex gap-4 rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-sm leading-relaxed text-amber-950">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold">Pre-launch mode is on</div>
            <p className="mt-1 text-amber-900/80">
              Learners can enrol and pay, but can&apos;t open courses yet — they see &ldquo;your place is
              secured&rdquo;. You can build and preview everything. On launch day, remove the{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">PRELAUNCH</code> environment
              variable and redeploy.
              {launchPending > 0 && ` ${launchPending} enrolled learner${launchPending === 1 ? " is" : "s are"} waiting.`}
            </p>
          </div>
        </div>
      ) : (
        launchPending > 0 && (
          <div className="card flex flex-wrap items-center gap-4 p-5 text-sm">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600">
              <Rocket className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink-950">Courses are open</div>
              <p className="mt-0.5 text-ink-500">Let learners who enrolled before launch know they can start.</p>
            </div>
            <LaunchEmailButton pending={launchPending} />
          </div>
        )
      )}

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Learners" value={learners} icon={GraduationCap} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Active enrolments" value={activeEnrolments} icon={BookOpen} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Programmes" value={programs} icon={Layers} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Revenue"
            value={formatNaira(revenue._sum.amount ?? 0)}
            icon={Wallet}
            hint={`${completions} lessons completed by learners`}
          />
        </StaggerItem>
      </Stagger>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-[15px] font-semibold text-ink-950">Recent payments</h2>
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-1 text-sm text-ink-500 transition-colors hover:text-ink-900"
          >
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <PaymentsTable payments={recent} />
      </section>
    </div>
  );
}
