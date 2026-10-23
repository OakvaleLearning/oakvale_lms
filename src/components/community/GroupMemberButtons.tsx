"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, Undo2 } from "lucide-react";
import { setGroupMembership } from "@/app/community/actions";

/** Remove a member from a group (`member` true) or let a removed one back in. */
export function GroupMembershipButton({ groupId, userId, name, member }: { groupId: string; userId: string; name: string; member: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function run() {
    if (member && !window.confirm(`Remove ${name} from this group? They keep their account and other groups, and you can let them back in later.`)) return;
    setError("");
    start(async () => {
      const res = await setGroupMembership(groupId, userId, !member);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  const Icon = member ? UserMinus : Undo2;
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={
          member
            ? "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-60"
            : "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
        }
      >
        <Icon className="size-3.5" /> {pending ? "Saving…" : member ? "Remove" : "Let back in"}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-accent-600">{error}</p>}
    </div>
  );
}
