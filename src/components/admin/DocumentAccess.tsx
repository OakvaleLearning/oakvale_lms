"use client";

import { useState, useTransition } from "react";
import { Download, Eye } from "lucide-react";
import { updateBlock } from "@/app/admin/lessons/[id]/actions";

/**
 * Whether learners can save this document. They can always read it in the
 * lesson; turning downloads off just removes the Download and Open-in-new-tab
 * buttons.
 */
export function DocumentAccess({ blockId, allowDownload }: { blockId: string; allowDownload: boolean }) {
  const [allowed, setAllowed] = useState(allowDownload);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function change(next: boolean) {
    const before = allowed;
    setAllowed(next);
    setError("");
    start(async () => {
      const res = await updateBlock(blockId, { allowDownload: next });
      if (!res.ok) {
        setAllowed(before);
        setError(res.error);
      }
    });
  }

  return (
    <fieldset className="rounded-xl border border-line bg-white p-4" disabled={pending}>
      <legend className="px-1 text-sm font-medium text-ink-900">Learner access</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { value: false, icon: Eye, title: "View in lesson only", hint: "Learners read it here. No download buttons." },
          { value: true, icon: Download, title: "View and download", hint: "Learners can also save a copy." },
        ].map(({ value, icon: Icon, title, hint }) => (
          <label
            key={title}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-ink-300 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-100"
          >
            <input type="radio" name={`access-${blockId}`} checked={allowed === value} onChange={() => change(value)} className="peer sr-only" />
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 peer-checked:bg-primary-600 peer-checked:text-white">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-900">{title}</span>
              <span className="block text-xs leading-relaxed text-ink-500">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        This stops casual saving. A learner who is determined can still capture what they can see on screen.
      </p>
      {error && <p className="mt-2 text-xs text-accent-600">{error}</p>}
    </fieldset>
  );
}
