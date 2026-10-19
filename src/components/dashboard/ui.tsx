import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
  accent?: "primary" | "accent" | "emerald" | "amber";
}) {
  const accents = {
    primary: "bg-primary-50 text-primary-600",
    accent: "bg-accent-50 text-accent-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  } as const;
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className={cn("grid size-10 place-items-center rounded-xl", accents[accent])}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-ink-900">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 ring-amber-200",
  PENDING: "bg-ink-100 text-ink-600 ring-ink-200",
  CANCELLED: "bg-ink-100 text-ink-500 ring-ink-200",
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAILED: "bg-accent-50 text-accent-700 ring-accent-200",
  ABANDONED: "bg-ink-100 text-ink-500 ring-ink-200",
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  UPLOADING: "bg-amber-50 text-amber-700 ring-amber-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DRAFT: "bg-ink-100 text-ink-600 ring-ink-200",
  EMPTY: "bg-amber-50 text-amber-700 ring-amber-200",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status] ?? "bg-ink-100 text-ink-600 ring-ink-200"
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabels[status] ?? status}
    </span>
  );
}
