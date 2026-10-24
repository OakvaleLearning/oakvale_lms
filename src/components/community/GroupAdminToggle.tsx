"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { setGroupAdmin } from "@/app/community/actions";

/** Make a member a group admin, or take it away. Shown only to people who can manage the group. */
export function GroupAdminToggle({ groupId, userId, name, isAdmin }: { groupId: string; userId: string; name: string; isAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    if (isAdmin && !window.confirm(`Remove ${name} as an admin of this group?`)) return;
    setError("");
    start(async () => {
      const res = await setGroupAdmin(groupId, userId, !isAdmin);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  const Icon = isAdmin ? ShieldOff : ShieldCheck;
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
      >
        <Icon className="size-3.5" /> {pending ? "Saving…" : isAdmin ? "Remove admin" : "Make admin"}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-accent-600">{error}</p>}
    </div>
  );
}
