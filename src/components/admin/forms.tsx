"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Check, CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";

type State = { error?: string; ok?: boolean } | undefined;

/** A form bound to a server action that returns { error } / { ok }. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  resetOnSuccess = false,
  className,
  footerClassName,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  footerClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useContext(DialogContext);

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    dialog?.close();
  }, [state, resetOnSuccess, dialog]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-5", className)}>
      {children}
      <div className={cn("flex flex-wrap items-center gap-3", footerClassName)}>
        <SubmitButton>{submitLabel}</SubmitButton>
        {state?.error && (
          <span role="alert" className="text-sm text-accent-600">
            {state.error}
          </span>
        )}
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
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-900 shadow-card outline-none transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-primary-500 focus:ring-3 focus:ring-primary-100";

export function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink-800">
        {label}
        {optional && <span className="text-xs font-normal text-ink-400">Optional</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
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
  stacked = false,
}: {
  defaultTitle?: string;
  defaultSlug?: string;
  titleLabel?: string;
  /** One field per row, for narrow columns. */
  stacked?: boolean;
}) {
  const [slug, setSlug] = useState(defaultSlug);
  const [touched, setTouched] = useState(Boolean(defaultSlug));
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return (
    <div className={cn("grid gap-4", !stacked && "sm:grid-cols-2")}>
      <Field label={titleLabel}>
        <Input
          name="title"
          required
          defaultValue={defaultTitle}
          onChange={(e) => !touched && setSlug(slugify(e.target.value))}
        />
      </Field>
      <Field label="Link name" hint="Lowercase letters, numbers and hyphens">
        <span className="flex rounded-lg shadow-card focus-within:ring-3 focus-within:ring-primary-100">
          <span className="grid place-items-center rounded-l-lg border border-r-0 border-line bg-ink-50 px-2.5 text-sm text-ink-400">
            /
          </span>
          <Input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(e.target.value);
            }}
            className="rounded-l-none shadow-none focus:ring-0"
          />
        </span>
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
          onClick={(e) => {
            // Inside a <summary>, don't also open/close the section.
            e.preventDefault();
            start(() => onMove(d));
          }}
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

export function Panel({
  title,
  description,
  children,
  actions,
  flush = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** No inner padding, for edge-to-edge lists. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={cn(!flush && "p-5 sm:p-6")}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Switches, option cards, dialogs, inline rename
 * ------------------------------------------------------------------ */

/** On/off setting; posts "on" like a checkbox, so server actions read it the same way. */
export function Switch({
  label,
  description,
  ...props
}: { label: string; description?: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3 transition-colors hover:border-ink-300 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-100">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{description}</span>}
      </span>
      <input type="checkbox" {...props} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-ink-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary-600 peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/** A checkbox styled as a selectable card (e.g. which courses a tier unlocks). */
export function CheckCard({ label, hint, ...props }: { label: string; hint?: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm transition-colors hover:border-ink-300 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-100">
      <input type="checkbox" {...props} className="peer sr-only" />
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-md border border-line bg-white text-transparent peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white"
      >
        <Check className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

const DialogContext = createContext<{ close: () => void } | null>(null);

/** Button that opens a centred dialog; an ActionForm inside closes it on success. */
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerVariant = "primary",
  triggerSize = "sm",
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  triggerVariant?: "primary" | "outline" | "ghost";
  triggerSize?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-6">
            <motion.div
              className="absolute inset-0 bg-ink-950/40"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-white shadow-raised sm:max-w-lg sm:rounded-2xl"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-ink-950">{title}</h2>
                  {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-ink-100"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-6">
                <DialogContext.Provider value={{ close: () => setOpen(false) }}>{children}</DialogContext.Provider>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/** A title that turns into a small form when the pencil is clicked. */
export function InlineRename({
  action,
  defaultValue,
  className,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  defaultValue: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: State, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) setEditing(false);
    return result;
  }, undefined);

  if (!editing) {
    return (
      <span className={cn("group/rename flex min-w-0 items-center gap-1.5", className)}>
        <span className="truncate">{defaultValue}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 hover:text-ink-700 focus-visible:opacity-100 group-hover/rename:opacity-100"
          aria-label="Rename"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }
  return (
    <form action={formAction} className="flex min-w-0 flex-1 items-center gap-2">
      <Input name="title" defaultValue={defaultValue} required autoFocus className="h-9 py-1.5" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} aria-label="Cancel">
        <X className="size-4" />
      </Button>
      {state?.error && <span className="text-xs text-accent-600">{state.error}</span>}
    </form>
  );
}

/** Dashed "add" row used at the end of lists. */
export function AddRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-ink-200 bg-canvas/60 p-2 text-sm text-ink-500">
      <Plus className="ml-1 size-4 shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
