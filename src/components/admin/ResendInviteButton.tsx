"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { resendAdminInvite } from "@/app/admin/team/actions";

export function ResendInviteButton({ userId }: { userId: string }) {
  const [state, action, busy] = useActionState(resendAdminInvite, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="userId" value={userId} />
      {state?.error && <span className="text-sm text-accent-600">{state.error}</span>}
      {state?.ok && !busy && (
        <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
          <CheckCircle2 className="size-4" /> Sent
        </span>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Resend invite
      </Button>
    </form>
  );
}
