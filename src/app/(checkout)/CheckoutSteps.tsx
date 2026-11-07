"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Choose plan", "Account", "Payment"];
// Tiers with a pre-assessment add a step before payment.
const ASSESSED_STEPS = ["Choose plan", "Account", "Assessment", "Payment"];

/** Choose plan → Account → (Assessment) → Payment, worked out from the route and whether the visitor has a confirmed account. */
export function CheckoutSteps({ verified }: { verified: boolean }) {
  const pathname = usePathname();
  const assessing = pathname.startsWith("/pre-assessment");
  const steps = assessing ? ASSESSED_STEPS : STEPS;
  const current = assessing ? 2 : pathname.startsWith("/payment") ? 2 : pathname.startsWith("/verify-email") ? 1 : 0;

  return (
    <ol className="hidden items-center gap-2 text-xs font-medium sm:flex" aria-label="Checkout progress">
      {steps.map((label, i) => {
        const done = i < current || (i === 1 && verified);
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-line" aria-hidden />}
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-[10px] tabular-nums",
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-primary-600 text-white"
                    : "border border-line bg-white text-ink-500"
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={active ? "text-ink-950" : "text-ink-500"} aria-current={active ? "step" : undefined}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
