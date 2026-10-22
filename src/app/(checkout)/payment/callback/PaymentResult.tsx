"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/content/site";

type State = "verifying" | "success" | "failed" | "error";

export function PaymentResult({ prelaunch }: { prelaunch: boolean }) {
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
        <Loader2 className="size-10 animate-spin text-primary-600" />
        <h1 className="mt-6 font-display text-3xl text-ink-950">Verifying your payment…</h1>
        <p className="mt-2 text-ink-500">Please wait while we confirm your transaction.</p>
      </Card>
    );
  }

  if (state === "success") {
    return (
      <Card>
        <CheckCircle2 className="size-12 text-emerald-600" strokeWidth={1.5} />
        <h1 className="mt-6 font-display text-3xl text-ink-950">You&apos;re enrolled!</h1>
        <p className="mt-2 max-w-sm text-ink-500">
          {prelaunch
            ? "Your payment is confirmed and your place is secured. Our learning platform opens soon, and we'll email you the moment your courses are ready."
            : "Your payment is confirmed and your courses are ready. Learn at your own pace."}
        </p>
        <ButtonLink href="/learn" className="mt-8">
          {prelaunch ? "View my enrolment" : "Start learning"}
          <ArrowRight className="size-4" />
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card>
      <XCircle className="size-12 text-accent-600" strokeWidth={1.5} />
      <h1 className="mt-6 font-display text-3xl text-ink-950">
        {state === "error" ? "Something went wrong" : "Payment not completed"}
      </h1>
      <p className="mt-2 max-w-sm text-ink-500">
        {state === "error"
          ? "We couldn't verify your payment. If you were charged, please contact support."
          : "Your payment wasn't completed. You can try again. You won't be charged twice."}
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
    <div className="mx-auto flex max-w-lg flex-col items-center card px-8 py-16 text-center">
      {children}
    </div>
  );
}
