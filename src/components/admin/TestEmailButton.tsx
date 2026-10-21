"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendTestEmail } from "@/app/admin/email-actions";

export function TestEmailButton({ emailKey, disabled }: { emailKey: string; disabled?: boolean }) {
  const [state, action, busy] = useActionState(sendTestEmail, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="key" value={emailKey} />
      {state?.error && <span className="text-sm text-accent-600">{state.error}</span>}
      {state?.message && !busy && <span className="text-sm text-emerald-600">{state.message}</span>}
      <Button type="submit" variant="outline" size="sm" disabled={busy || disabled}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Send me a test
      </Button>
    </form>
  );
}
