"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { sendLaunchEmails } from "@/app/admin/launch-actions";

export function LaunchEmailButton({ pending }: { pending: number }) {
  const [state, action, busy] = useActionState(sendLaunchEmails, undefined);
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const learners = `${pending} learner${pending === 1 ? "" : "s"}`;
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-3">
      {confirming ? (
        <InlineConfirm
          message={`Email ${learners} that their courses are open?`}
          confirmLabel="Send emails"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            form.current?.requestSubmit();
          }}
        />
      ) : (
        <Button type="button" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Email {learners}: courses are open
        </Button>
      )}
      {state?.error && <span className="text-sm text-accent-600">{state.error}</span>}
      {state?.message && !busy && <span className="text-sm text-emerald-600">{state.message}</span>}
    </form>
  );
}
