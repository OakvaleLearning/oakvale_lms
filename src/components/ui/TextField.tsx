"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink-900 shadow-card outline-none transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-primary-500 focus:ring-3 focus:ring-primary-100";

/** A labelled input with an optional hint or right-aligned label action. */
export function TextField({
  label,
  hint,
  labelAction,
  className,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  labelAction?: ReactNode;
} & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-800">{label}</span>
        {labelAction}
      </span>
      <input {...props} className={cn(inputClass, className)} />
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">{hint}</span>}
    </label>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField({
  label,
  hint,
  labelAction,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  labelAction?: ReactNode;
} & Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-800">{label}</span>
        {labelAction}
      </span>
      <span className="relative block">
        <input {...props} type={visible ? "text" : "password"} className={cn(inputClass, "pr-11")} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-accent-200 bg-accent-50 px-3.5 py-3 text-sm text-accent-800"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {children}
    </div>
  );
}

/** Title + supporting line at the top of each auth screen. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-ink-950 sm:text-[2.125rem]">
        {title}
      </h1>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{children}</p>}
    </div>
  );
}
