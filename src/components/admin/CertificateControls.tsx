"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Send, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { restoreCertificate, revokeCertificate, setCpdStatus } from "@/app/admin/certificates/actions";

/** Revoke (with an optional reason) or restore an issued certificate. */
export function RevokeButton({ id, revoked }: { id: string; revoked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      className={revoked ? undefined : "text-accent-700 hover:bg-accent-50"}
      onClick={() => {
        if (revoked) {
          if (!confirm("Restore this certificate? It will verify as valid again.")) return;
          start(async () => void (await restoreCertificate(id), router.refresh()));
          return;
        }
        const reason = prompt("Revoke this certificate? It will show as revoked when anyone verifies it.\n\nReason (optional):");
        if (reason === null) return;
        start(async () => void (await revokeCertificate(id, reason), router.refresh()));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : revoked ? <RotateCcw className="size-4" /> : <ShieldOff className="size-4" />}
      {revoked ? "Restore" : "Revoke"}
    </Button>
  );
}

export interface CpdRow {
  id: string;
  learner: string;
  email: string;
  phone: string | null;
  course: string;
  provider: string;
  hours: number | null;
  issuedAt: string;
  status: "PENDING" | "SUBMITTED" | "ISSUED";
  updatedAt: string | null;
}

const STATUS: Record<CpdRow["status"], { label: string; className: string }> = {
  PENDING: { label: "To send", className: "bg-amber-50 text-amber-800" },
  SUBMITTED: { label: "Sent to body", className: "bg-primary-50 text-primary-700" },
  ISSUED: { label: "Issued", className: "bg-emerald-50 text-emerald-700" },
};

/** CPD requests with bulk "sent to the issuing body" / "issued" updates. */
export function CpdQueue({ rows }: { rows: CpdRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const all = rows.length > 0 && selected.length === rows.length;

  function mark(status: CpdRow["status"]) {
    start(async () => {
      await setCpdStatus(selected, status);
      setSelected([]);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <label className="mr-auto flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={all}
            onChange={() => setSelected(all ? [] : rows.map((r) => r.id))}
            className="size-4 accent-primary-600"
          />
          {selected.length ? `${selected.length} selected` : "Select all"}
        </label>
        {pending && <Loader2 className="size-4 animate-spin text-ink-500" />}
        <Button type="button" size="sm" variant="outline" disabled={!selected.length || pending} onClick={() => mark("SUBMITTED")}>
          <Send className="size-4" /> Mark sent to body
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!selected.length || pending} onClick={() => mark("ISSUED")}>
          <Check className="size-4" /> Mark issued
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-canvas sm:px-5">
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                className="mt-1 size-4 shrink-0 accent-primary-600"
              />
              <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">{r.learner}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {r.email}
                    {r.phone && ` · ${r.phone}`}
                  </span>
                </span>
                <span className="min-w-0 text-xs text-ink-600">
                  <span className="block truncate text-sm text-ink-800">{r.course}</span>
                  {r.provider}
                  {r.hours ? ` · ${r.hours} hours` : ""} · completed {r.issuedAt}
                </span>
                <span className="flex items-center gap-2 sm:justify-end">
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", STATUS[r.status].className)}>
                    {STATUS[r.status].label}
                  </span>
                  {r.updatedAt && r.status !== "PENDING" && <span className="text-xs text-ink-400">{r.updatedAt}</span>}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
