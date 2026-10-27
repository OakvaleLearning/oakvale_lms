import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion";
import { PageSizeSelect } from "./PageSizeSelect";

/** Eyebrow, serif title, supporting copy and optional actions at the top of a page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink-950 sm:text-[2.125rem]">
          {title}
        </h1>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Centred message for empty or blocked states. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card mx-auto max-w-lg px-8 py-12 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl border border-line bg-canvas text-ink-500">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-5 font-display text-2xl text-ink-950">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{children}</div>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon className="size-4 text-ink-400" />
      </div>
      <div className="mt-6 font-display text-[2rem] leading-none text-ink-950 tabular-nums">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {hint && <div className="mt-2 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  ACTIVE: "text-emerald-700 [--dot:var(--color-emerald-500)]",
  PARTIAL: "text-amber-700 [--dot:var(--color-amber-500)]",
  PENDING: "text-ink-600 [--dot:var(--color-ink-400)]",
  CANCELLED: "text-ink-500 [--dot:var(--color-ink-300)]",
  SUCCESS: "text-emerald-700 [--dot:var(--color-emerald-500)]",
  FAILED: "text-accent-700 [--dot:var(--color-accent-500)]",
  ABANDONED: "text-ink-500 [--dot:var(--color-ink-300)]",
  READY: "text-emerald-700 [--dot:var(--color-emerald-500)]",
  PROCESSING: "text-amber-700 [--dot:var(--color-amber-500)]",
  UPLOADING: "text-amber-700 [--dot:var(--color-amber-500)]",
  PUBLISHED: "text-emerald-700 [--dot:var(--color-emerald-500)]",
  DRAFT: "text-ink-600 [--dot:var(--color-ink-400)]",
  EMPTY: "text-amber-700 [--dot:var(--color-amber-500)]",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  PARTIAL: "Deposit paid",
  PENDING: "Pending",
  CANCELLED: "Cancelled",
  SUCCESS: "Success",
  FAILED: "Failed",
  ABANDONED: "Abandoned",
  READY: "Ready",
  PROCESSING: "Processing",
  UPLOADING: "Uploading",
  PUBLISHED: "Published",
  DRAFT: "Draft",
  EMPTY: "No content",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium whitespace-nowrap",
        statusStyles[status] ?? "text-ink-600 [--dot:var(--color-ink-400)]"
      )}
    >
      <span className="size-1.5 rounded-full bg-(--dot)" />
      {statusLabels[status] ?? status}
    </span>
  );
}

/** Trail of parent pages above a title; the last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  // Phones get a single "back to parent" link; the full trail would truncate to nothing.
  const parent = items.findLast((item) => item.href);
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      {parent?.href && (
        <Link
          href={parent.href}
          className="flex min-w-0 items-center gap-1 text-sm text-ink-500 transition-colors hover:text-ink-900 sm:hidden"
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      <ol className="hidden min-w-0 items-center gap-1.5 text-sm text-ink-500 sm:flex">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-300" />}
            {item.href ? (
              <Link href={item.href} className="truncate transition-colors hover:text-ink-900">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink-800">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page numbers with gaps: 1 … 4 5 6 … 12. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const shown = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...shown].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ["gap" as const, p] : [p]));
}

/**
 * "Showing 21–40 of 132" with Previous / numbered pages / Next, as plain links.
 * `href(p)` builds the link for page p, keeping the page's other query params.
 * With `sizes`, also a "Show N per page" selector (each option links to its size).
 */
export function Pagination({
  page,
  pageSize,
  total,
  href,
  sizes,
  noun = "results",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
  sizes?: { size: number; href: string }[];
  noun?: string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // The selector stays visible on a single page, as long as there's more than the smallest size to show.
  const showSizes = sizes && total > Math.min(...sizes.map((s) => s.size));
  if (pages <= 1 && !showSizes) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const cell = "grid h-9 min-w-9 place-items-center rounded-lg px-2.5 text-sm tabular-nums";
  const link = cn(cell, "border border-line bg-white text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50");
  const off = cn(cell, "border border-line/60 text-ink-300");
  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-sm text-ink-500">
        Showing <span className="font-medium text-ink-800">{from}–{to}</span> of{" "}
        <span className="font-medium text-ink-800">{total}</span> {noun}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {sizes && showSizes && <PageSizeSelect value={pageSize} options={sizes} />}
        {pages > 1 && (
          <ol className="flex items-center gap-1.5">
            <li>
              {page > 1 ? (
                <Link href={href(page - 1)} className={link} aria-label="Previous page" rel="prev">
                  <ChevronLeft className="size-4" />
                </Link>
              ) : (
                <span className={off} aria-hidden>
                  <ChevronLeft className="size-4" />
                </span>
              )}
            </li>
            {pageList(page, pages).map((p, i) =>
              p === "gap" ? (
                <li key={`gap-${i}`} className="hidden px-1 text-sm text-ink-400 sm:block" aria-hidden>
                  …
                </li>
              ) : (
                // The numbers take room phones don't have; there, Previous/Next and the count are enough.
                <li key={p} className="hidden sm:block">
                  {p === page ? (
                    <span aria-current="page" className={cn(cell, "bg-primary-600 font-medium text-white")}>
                      {p}
                    </span>
                  ) : (
                    <Link href={href(p)} className={link}>
                      {p}
                    </Link>
                  )}
                </li>
              )
            )}
            <li>
              {page < pages ? (
                <Link href={href(page + 1)} className={link} aria-label="Next page" rel="next">
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span className={off} aria-hidden>
                  <ChevronRight className="size-4" />
                </span>
              )}
            </li>
          </ol>
        )}
      </div>
    </nav>
  );
}
