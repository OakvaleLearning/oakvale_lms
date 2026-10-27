import type { Metadata } from "next";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, listHref, readPaging } from "@/lib/paging";
import { Input } from "@/components/admin/forms";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { PageHeader, Pagination } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const { page: requested, limit } = readPaging(sp);

  const contains = { contains: query, mode: "insensitive" as const };
  const where = query
    ? { OR: [{ reference: contains }, { user: { name: contains } }, { user: { email: contains } }] }
    : {};
  const total = await prisma.payment.count({ where });
  const page = clampPage(requested, total, limit);
  const payments = await prisma.payment.findMany({
    where,
    // id breaks ties so a payment never shows on two pages, or on none.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true } },
      enrollment: { include: { tier: { include: { program: true } } } },
    },
  });
  const pageHref = (p: number) => listHref("/admin/payments", { q: query, page: p, limit });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Commerce"
        title="Payments"
        description={`${total} Paystack ${total === 1 ? "transaction" : "transactions"}${query ? ` matching “${query}”` : ""}`}
        actions={
          <form className="relative w-full sm:w-72">
            {limit !== DEFAULT_PAGE_SIZE && <input type="hidden" name="limit" value={limit} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input name="q" defaultValue={query} placeholder="Search learner or reference" className="pl-9" />
          </form>
        }
      />
      <div className="card overflow-hidden">
        <PaymentsTable payments={payments} empty={query ? "No payments found." : undefined} showReference />
      </div>
      <Pagination
        page={page}
        pageSize={limit}
        total={total}
        href={pageHref}
        sizes={PAGE_SIZES.map((size) => ({ size, href: listHref("/admin/payments", { q: query, limit: size }) }))}
        noun="payments"
      />
    </div>
  );
}
