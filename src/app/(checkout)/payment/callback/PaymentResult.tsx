"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/content/site";

type State = "verifying" | "success" | "failed" | "error";

export function PaymentResult() {
  const reference = useSearchParams().get("reference");
  const [state, setState] = useState<State>(reference ? "verifying" : "error");

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`)
      .then((res) => res.json())
      .then((json) => !cancelled && setState(json.status === "success" ? "success" : "failed"))
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (state === "verifying") {
    return (
      <Card>
        <Loader2 className="size-14 animate-spin text-primary-600" />
        <h1 className="mt-6 text-2xl font-bold text-ink-900">Verifying your payment…</h1>
        <p className="mt-2 text-ink-500">Please wait while we confirm your transaction.</p>
      </Card>
    );
  }

  if (state === "success") {
    return (
      <Card>
        <CheckCircle2 className="size-16 text-emerald-500" />
        <h1 className="mt-6 text-2xl font-bold text-ink-900">You&apos;re enrolled!</h1>
        <p className="mt-2 max-w-sm text-ink-500">
          Your payment is confirmed and your courses are ready. Learn at your own pace.
        </p>
        <ButtonLink href="/learn" className="mt-8">
          Start learning
          <ArrowRight className="size-4" />
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card>
      <XCircle className="size-16 text-accent-500" />
      <h1 className="mt-6 text-2xl font-bold text-ink-900">
        {state === "error" ? "Something went wrong" : "Payment not completed"}
      </h1>
      <p className="mt-2 max-w-sm text-ink-500">
        {state === "error"
          ? "We couldn't verify your payment. If you were charged, please contact support."
          : "Your payment wasn't completed. You can try again — you won't be charged twice."}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/enroll">
          <RefreshCw className="size-4" />
          Try again
        </ButtonLink>
        <ButtonLink href={`mailto:${SITE.email}`} variant="outline">
          Contact support
        </ButtonLink>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-4xl border border-ink-100 bg-white px-8 py-16 text-center shadow-sm">
      {children}
    </div>
  );
}
