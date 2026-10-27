import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, listHref, readPaging } from "@/lib/paging";
import { Input } from "@/components/admin/forms";
import { PageHeader, Pagination } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Learners" };

export default async function LearnersPage({ searchParams }: PageProps<"/admin/learners">) {
  await requireAdmin();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const { page: requested, limit } = readPaging(sp);

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
  const total = await prisma.user.count({ where });
  const pageNo = clampPage(requested, total, limit);
  const learners = await prisma.user.findMany({
    where,
    // id breaks ties so a learner never shows on two pages, or on none.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (pageNo - 1) * limit,
    take: limit,
    include: {
      enrollments: { where: { status: "ACTIVE" }, include: { tier: { include: { program: { select: { title: true } } } } } },
      _count: { select: { progress: { where: { status: "COMPLETED" } } } },
    },
  });
  const pageHref = (p: number) => listHref("/admin/learners", { q: query, page: p, limit });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="People"
        title="Learners"
        description={`${total} ${total === 1 ? "learner" : "learners"}${query ? ` matching “${query}”` : ""}`}
        actions={
          <form className="relative w-full sm:w-72">
            {limit !== DEFAULT_PAGE_SIZE && <input type="hidden" name="limit" value={limit} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input name="q" defaultValue={query} placeholder="Search by name or email" className="pl-9" />
          </form>
        }
      />
      <div className="card overflow-hidden">
        {/* Phones: one card per learner */}
        <ul className="space-y-2 bg-canvas/60 p-3 md:hidden">
          {learners.map((l) => (
            <li key={l.id}>
              <Link
                href={`/admin/learners/${l.id}`}
                className="block rounded-xl border border-line bg-white p-4 shadow-card transition-colors active:bg-ink-50"
              >
                <p className="truncate font-medium text-ink-900">{l.name}</p>
                <p className="truncate text-xs text-ink-400">{l.email}</p>
                <p className="mt-2 text-sm text-ink-600">
                  {l.enrollments.length
                    ? l.enrollments.map((e) => `${e.tier.program.title} (${e.tier.name})`).join(", ")
                    : "Not enrolled"}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-500">
                  <span>
                    <span className="font-medium text-ink-900">{l._count.progress}</span>{" "}
                    {l._count.progress === 1 ? "lesson" : "lessons"} done
                  </span>
                  <span>Joined {formatDay(l.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
          {learners.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-400">No learners found.</li>}
        </ul>

        <div className="hidden overflow-x-auto md:block">
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
                      ? l.enrollments.map((e) => `${e.tier.program.title} (${e.tier.name})`).join(", ")
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
      </div>
      <Pagination
        page={pageNo}
        pageSize={limit}
        total={total}
        href={pageHref}
        sizes={PAGE_SIZES.map((size) => ({ size, href: listHref("/admin/learners", { q: query, limit: size }) }))}
        noun="learners"
      />
    </div>
  );
}
