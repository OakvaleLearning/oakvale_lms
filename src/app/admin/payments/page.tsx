import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PaymentsTable } from "@/components/admin/PaymentsTable";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireAdmin();
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } }, enrollment: { include: { tier: { include: { program: true } } } } },
  });
  return (
    <div className="mx-auto max-w-5xl rounded-3xl border border-ink-100 bg-white">
      <PaymentsTable payments={payments} />
    </div>
  );
}
