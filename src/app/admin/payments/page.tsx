import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { PageHeader } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireAdmin();
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } }, enrollment: { include: { tier: { include: { program: true } } } } },
  });
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader eyebrow="Commerce" title="Payments" description="The 200 most recent Paystack transactions." />
      <div className="card overflow-hidden">
        <PaymentsTable payments={payments} />
      </div>
    </div>
  );
}
