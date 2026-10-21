"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendLaunchEmails } from "@/app/admin/launch-actions";

export function LaunchEmailButton({ pending }: { pending: number }) {
  const [state, action, busy] = useActionState(sendLaunchEmails, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Email ${pending} learner${pending === 1 ? "" : "s"} that their courses are open?`)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Email {pending} learner{pending === 1 ? "" : "s"}: courses are open
      </Button>
      {state?.error && <span className="text-sm text-accent-600">{state.error}</span>}
      {state?.message && !busy && <span className="text-sm text-emerald-600">{state.message}</span>}
    </form>
  );
}
