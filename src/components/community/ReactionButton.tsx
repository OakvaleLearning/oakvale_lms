"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ThumbsUp } from "lucide-react";
import { REACTIONS, type ReactionKind } from "@/lib/community/shared";
import { cn } from "@/lib/utils";

const KINDS = Object.keys(REACTIONS) as ReactionKind[];

/**
 * Click to like (or undo); hover, long-press or the arrow key opens the picker.
 * The parent applies the change optimistically and calls the server.
 */
export function ReactionButton({
  mine,
  onReact,
  size = "md",
}: {
  mine: ReactionKind | null;
  onReact: (kind: ReactionKind | null) => void;
  size?: "sm" | "md";
}) {
  const [picker, setPicker] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressed = useRef(false);

  const show = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setPicker(true), 350);
  };
  const hide = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setPicker(false), 250);
  };

  const current = mine ? REACTIONS[mine] : null;

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        onClick={() => {
          if (longPressed.current) return void (longPressed.current = false);
          onReact(mine ? null : "LIKE");
        }}
        onTouchStart={() => {
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setPicker(true);
          }, 450);
        }}
        onTouchEnd={() => clearTimeout(pressTimer.current)}
        onKeyDown={(e) => e.key === "ArrowUp" && (e.preventDefault(), setPicker(true))}
        aria-pressed={Boolean(mine)}
        aria-label={current ? `${current.label} (remove)` : "Like"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors select-none",
          size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
          mine ? "text-primary-700 hover:bg-primary-50" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        )}
      >
        {current ? <span className={size === "sm" ? "text-sm" : "text-base"}>{current.emoji}</span> : <ThumbsUp className={size === "sm" ? "size-3.5" : "size-4"} />}
        {current?.label ?? "Like"}
      </button>

      <AnimatePresence>
        {picker && (
          <motion.div
            role="toolbar"
            aria-label="Reactions"
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            onMouseEnter={() => clearTimeout(hoverTimer.current)}
            className="absolute bottom-full left-0 z-30 mb-1.5 flex gap-0.5 rounded-full border border-line bg-white p-1 shadow-raised"
          >
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                title={REACTIONS[kind].label}
                aria-label={REACTIONS[kind].label}
                onClick={() => {
                  setPicker(false);
                  onReact(kind === mine ? null : kind);
                }}
                className={cn(
                  "grid size-9 place-items-center rounded-full text-xl transition-transform hover:-translate-y-0.5 hover:scale-125",
                  kind === mine && "bg-primary-50"
                )}
              >
                {REACTIONS[kind].emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Emoji stack + count, e.g. "👍❤️ 12". */
export function ReactionSummary({ kinds, count }: { kinds: ReactionKind[]; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
      <span className="flex -space-x-1">
        {(kinds.length ? kinds : (["LIKE"] as ReactionKind[])).map((k) => (
          <span key={k} className="grid size-5 place-items-center rounded-full bg-white text-[11px] ring-2 ring-white">
            {REACTIONS[k].emoji}
          </span>
        ))}
      </span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
