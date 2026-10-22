"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { rsvp } from "@/app/community/actions";
import { cn } from "@/lib/utils";

type Status = "GOING" | "MAYBE" | "NO";

const OPTIONS: { status: Status; label: string; icon: React.ElementType }[] = [
  { status: "GOING", label: "Going", icon: Check },
  { status: "MAYBE", label: "Maybe", icon: HelpCircle },
  { status: "NO", label: "Can't go", icon: X },
];

export function RsvpButtons({ eventId, current }: { eventId: string; current: Status | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function choose(next: Status) {
    const value = next === status ? null : next;
    const before = status;
    setStatus(value);
    setError("");
    start(async () => {
      const res = await rsvp(eventId, value).catch(() => null);
      if (!res?.ok) {
        setStatus(before);
        setError(res?.error ?? "That didn't save. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your RSVP">
        {OPTIONS.map(({ status: s, label, icon: Icon }) => (
          <button
            key={s}
            type="button"
            onClick={() => choose(s)}
            aria-pressed={status === s}
            disabled={pending}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-70",
              status === s
                ? s === "GOING"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-primary-600 bg-primary-600 text-white"
                : "border-line bg-white text-ink-800 shadow-card hover:border-ink-300"
            )}
          >
            {pending && status === s ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {label}
          </button>
        ))}
      </div>
      {status === "GOING" && <p className="mt-2 text-xs text-ink-500">We&apos;ll email you a reminder the day before.</p>}
      {error && <p className="mt-2 text-sm text-accent-700">{error}</p>}
    </div>
  );
}
