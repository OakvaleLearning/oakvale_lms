import type { Metadata } from "next";
import Link from "next/link";
import { Download, History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { AUDIT_CATEGORIES, categoryOf } from "@/lib/audit";
import { auditParams, auditTime, auditWhere, readAuditFilters } from "@/lib/audit-query";
import { PAGE_SIZES, clampPage, readPaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/Button";
import { Input, Select } from "@/components/admin/forms";
import { EmptyState, PageHeader, Pagination } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Activity log" };

const CHIP: Record<string, string> = {
  content: "bg-primary-50 text-primary-700",
  preAssessment: "bg-violet-50 text-violet-700",
  learners: "bg-emerald-50 text-emerald-700",
  certificates: "bg-amber-50 text-amber-800",
  community: "bg-sky-50 text-sky-700",
  support: "bg-teal-50 text-teal-700",
  team: "bg-rose-50 text-rose-700",
  emails: "bg-ink-100 text-ink-700",
  signIn: "bg-ink-100 text-ink-600",
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // ISO dates from changed event times.
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? auditTime(new Date(s)) : s;
}

/** Changed fields as "field: before → after"; anything else as "key: value". */
function Details({ details }: { details: Record<string, unknown> }) {
  const rows = Object.entries(details).filter(([k]) => k !== "recovered");
  if (!rows.length) return null;
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs text-ink-500">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-ink-600">{k}:</dt>
          <dd className="min-w-0 break-words">
            {Array.isArray(v) && v.length === 2 && k !== "types" && k !== "moduleIds" && k !== "certificateIds" && k !== "bankIds"
              ? `${show(v[0])} → ${show(v[1])}`
              : show(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Who did what in the admin area, and when. Recording started with the audit log; see src/lib/audit.ts. */
export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = readAuditFilters(sp);
  const { page: requested, limit } = readPaging(sp);
  const where = auditWhere(filters);

  const [total, actors, first] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["actorId", "actorName", "actorEmail"], _count: true, orderBy: { actorName: "asc" } }),
    prisma.auditLog.findFirst({ where: { NOT: { details: { path: ["recovered"], equals: true } } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const pageNo = clampPage(requested, total, limit);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (pageNo - 1) * limit,
    take: limit,
  });

  const href = (extra: Record<string, string | number | undefined>) => {
    const params = auditParams(filters, extra);
    return params.size ? `/admin/activity?${params}` : "/admin/activity";
  };
  const filtered = Object.values(filters).some(Boolean);
  const exportParams = auditParams(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Records"
        title="Activity log"
        description={`Every change made in the admin area: who made it, what changed and when (Lagos time).${
          first ? ` Recording since ${auditTime(first.createdAt).replace(/,.*$/, "")}; earlier entries marked “recovered” were rebuilt from existing records.` : ""
        }`}
        actions={
          <a
            href={`/api/admin/activity${exportParams.size ? `?${exportParams}` : ""}`}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" /> Download CSV
          </a>
        }
      />

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_auto_auto_1.4fr_auto]" action="/admin/activity">
        {filters.target && <input type="hidden" name="target" value={filters.target} />}
        <Select name="actor" defaultValue={filters.actor} aria-label="Admin">
          <option value="">All admins</option>
          {actors
            .filter((a) => a.actorId)
            .map((a) => (
              <option key={a.actorId} value={a.actorId!}>
                {a.actorName} ({a._count})
              </option>
            ))}
        </Select>
        <Select name="category" defaultValue={filters.category} aria-label="Kind of activity">
          <option value="">All activity</option>
          {Object.entries(AUDIT_CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={filters.from} aria-label="From" />
        <Input type="date" name="to" defaultValue={filters.to} aria-label="To" />
        <Input name="q" defaultValue={filters.q} placeholder="Search names, emails, details, IP" />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass({ size: "sm" })}>
            Apply
          </button>
          {filtered && (
            <Link href="/admin/activity" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={History} title={filtered ? "Nothing matches" : "No activity yet"}>
          {filtered ? "Try other filters." : "Changes made in the admin area will appear here."}
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <ol className="divide-y divide-line/70">
            {rows.map((r) => {
              const cat = categoryOf(r.action);
              const details = (r.details ?? {}) as Record<string, unknown>;
              return (
                <li key={r.id} className="grid gap-1.5 px-5 py-3.5 text-sm sm:grid-cols-[11rem_12rem_minmax(0,1fr)] sm:gap-5 sm:px-6">
                  <time dateTime={r.createdAt.toISOString()} className="text-xs tabular-nums text-ink-500 sm:pt-0.5">
                    {auditTime(r.createdAt)}
                  </time>
                  <div className="min-w-0">
                    {r.actorId ? (
                      <Link href={href({ actor: r.actorId })} className="font-medium text-ink-900 hover:text-primary-700">
                        {r.actorName}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-900">{r.actorName}</span>
                    )}
                    <span className="block truncate text-xs text-ink-400">{r.actorEmail}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-ink-800">
                      {cat && (
                        <span className={cn("mr-2 inline-block rounded-full px-2 py-px align-[1px] text-[11px] font-medium", CHIP[cat])}>
                          {AUDIT_CATEGORIES[cat].label}
                        </span>
                      )}
                      {r.summary}
                      {details.recovered === true && <span className="ml-2 text-xs text-ink-400">(recovered)</span>}
                    </p>
                    <Details details={details} />
                    {(r.ip || (r.targetType === "user" && r.targetId)) && (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-400">
                        {r.ip && <span>IP {r.ip}</span>}
                        {r.targetType === "user" && r.targetId && (
                          <Link href={`/admin/learners/${r.targetId}`} className="hover:text-primary-700">
                            View person
                          </Link>
                        )}
                        {r.targetType && r.targetId && (
                          <Link href={href({ target: `${r.targetType}:${r.targetId}`, page: undefined })} className="hover:text-primary-700">
                            All activity on this
                          </Link>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <Pagination
        page={pageNo}
        pageSize={limit}
        total={total}
        href={(p) => href({ page: p > 1 ? p : undefined, limit: limit !== 20 ? limit : undefined })}
        sizes={PAGE_SIZES.map((size) => ({ size, href: href({ limit: size !== 20 ? size : undefined }) }))}
        noun="entries"
      />
    </div>
  );
}
