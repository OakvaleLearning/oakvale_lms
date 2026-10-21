"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Choose plan", "Account", "Payment"];

/** Choose plan → Account → Payment, worked out from the route and whether the visitor is signed in. */
export function CheckoutSteps({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const current = pathname.startsWith("/payment") ? 2 : 0;

  return (
    <ol className="hidden items-center gap-2 text-xs font-medium sm:flex" aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const done = i < current || (i === 1 && signedIn);
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
