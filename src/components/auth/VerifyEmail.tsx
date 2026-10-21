"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/TextField";
import { HONEYPOT_FIELD } from "@/lib/auth-form";
import { cn } from "@/lib/utils";

const COOLDOWN_SEC = 60;

/** "Resend email" with a cooldown, used on /verify-email and in the learner banner. */
export function ResendVerificationButton({
  next,
  variant = "outline",
  className,
}: {
  next?: string | null;
  variant?: "outline" | "primary";
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next, [HONEYPOT_FIELD]: "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send the email");
      if (json.verified) {
        router.refresh();
        return;
      }
      setStatus("sent");
      setWait(COOLDOWN_SEC);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not send the email");
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={variant} onClick={resend} disabled={status === "loading" || wait > 0}>
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {wait > 0 ? `Resend in ${wait}s` : "Resend email"}
        </Button>
        {status === "sent" && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" /> New link sent
          </span>
        )}
      </div>
      {error && <FormError>{error}</FormError>}
    </div>
  );
}

/** Signs out and goes to sign-up, for someone who used the wrong address. */
export function SwitchAccountButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/signup");
        router.refresh();
      }}
      className="font-medium text-primary-600 hover:text-primary-800"
    >
      sign up again with a different email
    </button>
  );
}

/** Shown across the learner area until the email is confirmed. */
export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Confirm your email to enrol and start learning.</span> We sent a link to {email}.
      </p>
      <ResendVerificationButton className="shrink-0" />
    </div>
  );
}
