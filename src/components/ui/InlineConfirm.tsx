import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A question with Cancel and confirm buttons, shown in place of the control that asked.
 * Use this rather than window.confirm/prompt, which browsers can silently suppress.
 */
export function InlineConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
  className,
}: {
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra fields between the question and the buttons, e.g. a reason. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alertdialog" aria-label={typeof message === "string" ? message : undefined} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm text-ink-700">{message}</span>
      {children}
      <span className="inline-flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          // The control that asked has gone, so keep keyboard focus nearby, on the safe choice.
          autoFocus
          className="h-8 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-8 rounded-lg bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700"
        >
          {confirmLabel}
        </button>
      </span>
    </div>
  );
}
