import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/utils";
import { Input } from "@/components/admin/forms";
import { PageHeader } from "@/components/dashboard/ui";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Learners" };

const PAGE_SIZE = 50;

export default async function LearnersPage({ searchParams }: PageProps<"/admin/learners">) {
  await requireAdmin();
  const { q, page } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);

  const where = {
    role: "LEARNER" as const,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, learners] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNo - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        enrollments: { where: { status: "ACTIVE" }, include: { tier: { include: { program: { select: { title: true } } } } } },
        _count: { select: { progress: { where: { status: "COMPLETED" } } } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="People"
        title="Learners"
        description={`${total} ${total === 1 ? "learner" : "learners"}${query ? ` matching “${query}”` : ""}`}
        actions={
          <form className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input name="q" defaultValue={query} placeholder="Search by name or email" className="pl-9" />
          </form>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
            <tr>
              <th className="px-6 py-2.5 font-medium">Learner</th>
              <th className="px-6 py-2.5 font-medium">Enrolled in</th>
              <th className="px-6 py-2.5 font-medium">Lessons done</th>
              <th className="px-6 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {learners.map((l) => (
              <tr key={l.id} className="hover:bg-ink-50">
                <td className="px-6 py-3.5">
                  <Link href={`/admin/learners/${l.id}`} className="font-medium text-ink-900 hover:text-primary-600">
                    {l.name}
                  </Link>
                  <div className="text-xs text-ink-400">{l.email}</div>
                </td>
                <td className="px-6 py-3.5 text-ink-600">
                  {l.enrollments.length
                    ? l.enrollments.map((e) => `${e.tier.program.title} — ${e.tier.name}`).join(", ")
                    : "—"}
                </td>
                <td className="px-6 py-3.5 text-ink-900">{l._count.progress}</td>
                <td className="px-6 py-3.5 whitespace-nowrap text-ink-500">{formatDay(l.createdAt)}</td>
              </tr>
            ))}
            {learners.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-ink-400">
                  No learners found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-500">
          <span>
            Page {pageNo} of {pages} · {total} learners
          </span>
          <div className="flex gap-2">
            {pageNo > 1 && <ButtonLink variant="outline" size="sm" href={`?q=${encodeURIComponent(query)}&page=${pageNo - 1}`}>Previous</ButtonLink>}
            {pageNo < pages && <ButtonLink variant="outline" size="sm" href={`?q=${encodeURIComponent(query)}&page=${pageNo + 1}`}>Next</ButtonLink>}
          </div>
        </div>
      )}
    </div>
  );
}
