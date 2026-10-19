"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type State = { error?: string; ok?: boolean } | undefined;

/** A form bound to a server action that returns { error } / { ok }. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  resetOnSuccess = false,
  className,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {state?.error && <span className="text-sm text-accent-600">{state.error}</span>}
        {state?.ok && !pending && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

const fieldClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-200";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(fieldClass, props.className)} />;
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={cn(fieldClass, props.className)} />;
}

export function Select(props: React.ComponentProps<"select">) {
  return <select {...props} className={cn(fieldClass, props.className)} />;
}

export function Checkbox({ label, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-700">
      <input type="checkbox" {...props} className="size-4 accent-primary-600" />
      {label}
    </label>
  );
}

/** Slug input that follows the title until edited by hand. */
export function TitleSlugFields({
  defaultTitle = "",
  defaultSlug = "",
  titleLabel = "Title",
}: {
  defaultTitle?: string;
  defaultSlug?: string;
  titleLabel?: string;
}) {
  const [slug, setSlug] = useState(defaultSlug);
  const [touched, setTouched] = useState(Boolean(defaultSlug));
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={titleLabel}>
        <Input
          name="title"
          required
          defaultValue={defaultTitle}
          onChange={(e) => !touched && setSlug(slugify(e.target.value))}
        />
      </Field>
      <Field label="Slug" hint="Used in links, e.g. adult-care">
        <Input
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value);
          }}
        />
      </Field>
    </div>
  );
}

/** Up / down reorder buttons. */
export function MoveButtons({ onMove }: { onMove: (direction: -1 | 1) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex">
      {([-1, 1] as const).map((d) => (
        <button
          key={d}
          type="button"
          disabled={pending}
          onClick={() => start(() => onMove(d))}
          className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
          aria-label={d === -1 ? "Move up" : "Move down"}
        >
          {d === -1 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        </button>
      ))}
    </span>
  );
}

/** Confirm, then run a delete action; shows its error if it refuses. */
export function DeleteButton({
  onDelete,
  confirmText,
  label,
}: {
  onDelete: () => Promise<State | void>;
  confirmText: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          start(async () => {
            const res = await onDelete();
            setError(res && "error" in res && res.error ? res.error : "");
          });
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-ink-400 hover:bg-accent-50 hover:text-accent-600 disabled:opacity-40",
          label ? "px-3 py-1.5 text-sm" : "size-8 justify-center"
        )}
        aria-label={label ?? "Delete"}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {label}
      </button>
      {error && <span className="text-xs text-accent-600">{error}</span>}
    </span>
  );
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-6 py-4">
        <h2 className="font-bold text-ink-900">{title}</h2>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
