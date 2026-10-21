import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, GraduationCap, Layers, Rocket, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/ui";
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
    <div className="space-y-8">
      {prelaunch ? (
        <div className="flex gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <CalendarClock className="size-6 shrink-0" />
          <div>
            <div className="font-bold">Pre-launch mode is on</div>
            Learners can enrol and pay, but can&apos;t open courses yet — they see &ldquo;your place is
            secured&rdquo;. You can build and preview everything. On launch day, remove the{" "}
            <code className="font-mono">PRELAUNCH</code> environment variable and redeploy.
            {launchPending > 0 && ` ${launchPending} enrolled learner${launchPending === 1 ? " is" : "s are"} waiting.`}
          </div>
        </div>
      ) : (
        launchPending > 0 && (
          <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-primary-100 bg-primary-50 p-5 text-sm text-ink-800">
            <Rocket className="size-6 shrink-0 text-primary-600" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Courses are open</div>
              Let learners who enrolled before launch know they can start.
            </div>
            <LaunchEmailButton pending={launchPending} />
          </div>
        )
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Learners" value={learners} icon={GraduationCap} />
        <StatCard label="Active enrolments" value={activeEnrolments} icon={BookOpen} accent="emerald" />
        <StatCard label="Programmes" value={programs} icon={Layers} accent="accent" />
        <StatCard
          label="Revenue"
          value={formatNaira(revenue._sum.amount ?? 0)}
          icon={Wallet}
          accent="amber"
          hint={`${completions} lessons completed by learners`}
        />
      </div>

      <section className="rounded-3xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="font-bold text-ink-900">Recent payments</h2>
          <Link href="/admin/payments" className="text-sm font-medium text-primary-600">
            View all
          </Link>
        </div>
        <PaymentsTable payments={recent} />
      </section>
    </div>
  );
}
