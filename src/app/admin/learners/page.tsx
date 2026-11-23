import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { cn, formatDate, formatDay } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, listHref, readPaging } from "@/lib/paging";
import { activeLearnerWhere, getCurrentPoints, inactiveLearnerWhere, type CurrentPoint } from "@/lib/lms/learner-report";
import { Input } from "@/components/admin/forms";
import { PageHeader, Pagination } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Learners" };

/** Active = holds an ACTIVE enrolment (paid, or granted by an admin). Everyone else has only registered. */
const TABS = [
  { id: "active", label: "Active", where: activeLearnerWhere },
  { id: "inactive", label: "Registered, not active", where: inactiveLearnerWhere },
  { id: "all", label: "All", where: {} },
] as const;
type TabId = (typeof TABS)[number]["id"];

function CurrentlyOn({ point }: { point: CurrentPoint | undefined }) {
  if (!point) return <span className="text-ink-400">Not started</span>;
  return (
    <>
      <div className="text-ink-800">
        {point.lessonTitle}
        {point.status === "COMPLETED" && <span className="ml-1.5 text-xs text-emerald-700">· done</span>}
      </div>
      <div className="text-xs text-ink-400">
        {point.moduleTitle} · {point.topicTitle}
      </div>
    </>
  );
}

export default async function LearnersPage({ searchParams }: PageProps<"/admin/learners">) {
  await requireAdmin();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const tab: TabId = TABS.find((t) => t.id === sp.status)?.id ?? "active";
  const { page: requested, limit } = readPaging(sp);

  const base: Prisma.UserWhereInput = {
    role: "LEARNER",
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.UserWhereInput = { ...base, ...TABS.find((t) => t.id === tab)!.where };
  const [total, activeCount, inactiveCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...base, ...activeLearnerWhere } }),
    prisma.user.count({ where: { ...base, ...inactiveLearnerWhere } }),
  ]);
  const counts: Record<TabId, number> = { active: activeCount, inactive: inactiveCount, all: activeCount + inactiveCount };
  const pageNo = clampPage(requested, total, limit);
  const learners = await prisma.user.findMany({
    where,
    // id breaks ties so a learner never shows on two pages, or on none.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (pageNo - 1) * limit,
    take: limit,
    include: {
      enrollments: {
        where: { status: { in: ["ACTIVE", "PENDING"] } },
        orderBy: { createdAt: "desc" },
        include: { tier: { include: { program: { select: { title: true } } } } },
      },
      _count: { select: { progress: { where: { status: "COMPLETED" } } } },
    },
  });
  const points = await getCurrentPoints(learners.map((l) => l.id));

  const filters = { status: tab === "active" ? undefined : tab };
  const pageHref = (p: number) => listHref("/admin/learners", { q: query, page: p, limit, filters });
  const rows = learners.map((l) => {
    const active = l.enrollments.filter((e) => e.status === "ACTIVE");
    const pending = l.enrollments.filter((e) => e.status === "PENDING");
    return {
      ...l,
      isActive: active.length > 0,
      enrolledIn: active.map((e) => `${e.tier.program.title} (${e.tier.name})`).join(", "),
      // Not active: how far they got towards paying.
      signup: pending.length
        ? `Checkout started: ${pending.map((e) => `${e.tier.program.title} (${e.tier.name})`).join(", ")}`
        : l.emailVerifiedAt
          ? "Email verified, no checkout yet"
          : "Email not verified",
      point: points.get(l.id),
    };
  });
  const showActivity = tab !== "inactive";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="People"
        title="Learners"
        description={`${counts.active} active · ${counts.inactive} registered but not active${query ? ` matching “${query}”` : ""}. A learner becomes active once they pay for (or are granted) a tier.`}
        actions={
          <form className="relative w-full sm:w-72">
            {tab !== "active" && <input type="hidden" name="status" value={tab} />}
            {limit !== DEFAULT_PAGE_SIZE && <input type="hidden" name="limit" value={limit} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input name="q" defaultValue={query} placeholder="Search by name or email" className="pl-9" />
          </form>
        }
      />

      <nav aria-label="Learner status" className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={listHref("/admin/learners", { q: query, limit, filters: { status: t.id === "active" ? undefined : t.id } })}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-4 py-1.5 text-center text-sm whitespace-nowrap transition-colors sm:flex-none",
              tab === t.id ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
            )}
          >
            {t.label} <span className="tabular-nums text-ink-400">{counts[t.id]}</span>
          </Link>
        ))}
      </nav>

      <div className="card overflow-hidden">
        {/* Phones: one card per learner */}
        <ul className="space-y-2 bg-canvas/60 p-3 md:hidden">
          {rows.map((l) => (
            <li key={l.id}>
              <Link
                href={`/admin/learners/${l.id}`}
                className="block rounded-xl border border-line bg-white p-4 shadow-card transition-colors active:bg-ink-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{l.name}</p>
                    <p className="truncate text-xs text-ink-400">{l.email}</p>
                  </div>
                  {tab === "all" && <ActiveTag active={l.isActive} />}
                </div>
                <p className="mt-2 text-sm text-ink-600">{l.isActive ? l.enrolledIn : l.signup}</p>
                {l.isActive && (
                  <div className="mt-2 text-sm">
                    <span className="text-xs text-ink-500">Currently on: </span>
                    <CurrentlyOn point={l.point} />
                  </div>
                )}
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
          {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-400">No learners found.</li>}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
              <tr>
                <th className="px-6 py-2.5 font-medium">Learner</th>
                <th className="px-6 py-2.5 font-medium">{tab === "inactive" ? "Sign-up stage" : "Enrolled in"}</th>
                {showActivity && <th className="px-6 py-2.5 font-medium">Currently on</th>}
                {showActivity && <th className="px-6 py-2.5 font-medium">Last active</th>}
                <th className="px-6 py-2.5 font-medium">Lessons done</th>
                <th className="px-6 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-ink-50">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/learners/${l.id}`} className="font-medium text-ink-900 hover:text-primary-600">
                        {l.name}
                      </Link>
                      {tab === "all" && <ActiveTag active={l.isActive} />}
                    </div>
                    <div className="text-xs text-ink-400">{l.email}</div>
                  </td>
                  <td className="px-6 py-3.5 text-ink-600">{l.isActive ? l.enrolledIn : <span className="text-ink-500">{l.signup}</span>}</td>
                  {showActivity && (
                    <td className="px-6 py-3.5">
                      <CurrentlyOn point={l.point} />
                    </td>
                  )}
                  {showActivity && (
                    <td className="px-6 py-3.5 whitespace-nowrap text-ink-500">{l.point ? formatDate(l.point.at) : "—"}</td>
                  )}
                  <td className="px-6 py-3.5 text-ink-900">{l._count.progress}</td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-ink-500">{formatDay(l.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showActivity ? 6 : 4} className="px-6 py-8 text-center text-ink-400">
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
        sizes={PAGE_SIZES.map((size) => ({ size, href: listHref("/admin/learners", { q: query, limit: size, filters }) }))}
        noun="learners"
      />
    </div>
  );
}

function ActiveTag({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        active ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"
      )}
    >
      {active ? "Active" : "Not active"}
    </span>
  );
}
