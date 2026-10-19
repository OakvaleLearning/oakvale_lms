import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, GraduationCap, Layers, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/ui";
import { PaymentsTable } from "@/components/admin/PaymentsTable";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverview() {
  await requireAdmin();
  const [learners, activeEnrolments, programs, revenue, completions, recent] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-8">
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
