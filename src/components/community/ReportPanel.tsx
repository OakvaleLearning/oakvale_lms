"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { report } from "@/app/community/actions";
import { cn } from "@/lib/utils";

const REASONS = ["Spam or advertising", "Harassment or bullying", "Inappropriate or offensive", "False or misleading", "Something else"];

/** Inline "why are you reporting this?" panel; reports go to the admin queue. */
export function ReportPanel({ target, onClose }: { target: { postId: string } | { commentId: string }; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function send() {
    setState("sending");
    const res = await report(target, reason).catch(() => ({ ok: false as const, error: "That didn't send. Try again." }));
    if (!res.ok) {
      setState("idle");
      setError(res.error);
      return;
    }
    setState("sent");
    setTimeout(onClose, 1800);
  }

  if (state === "sent") {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="size-4" /> Thanks! The Oakvale team will take a look.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
      <p className="text-sm font-medium text-ink-900">Why are you reporting this?</p>
      <p className="mt-0.5 text-xs text-ink-500">Only the Oakvale team sees reports.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            aria-pressed={reason === r}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs ring-1 transition-colors",
              reason === r ? "bg-primary-600 text-white ring-primary-600" : "bg-white text-ink-700 ring-line hover:bg-ink-50"
            )}
          >
            {r}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-accent-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={send} disabled={!reason || state === "sending"}>
          {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : "Send report"}
        </Button>
      </div>
    </div>
  );
}
