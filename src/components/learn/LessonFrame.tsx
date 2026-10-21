"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Expand, Maximize2, Minimize2, Shrink } from "lucide-react";

const noopSubscribe = () => () => {};

/**
 * Card around an HTML/SCORM lesson iframe, with "Expand" (fill the browser
 * window) and "Full screen" (Fullscreen API) controls. Only class names change
 * between modes, so the iframe is never remounted and a running SCORM package
 * keeps its session.
 */
export function LessonFrame({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // iPhone Safari can't make a div full screen; Expand still works there.
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(document.fullscreenEnabled),
    () => false
  );

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => setExpanded(true));
  }

  const large = expanded || fullscreen;
  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950";

  return (
    <div
      ref={ref}
      className={
        large
          ? "fixed inset-0 z-[45] flex flex-col bg-white"
          : "card flex flex-col overflow-hidden"
      }
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{title}</span>
        {!fullscreen && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={button}
            aria-pressed={expanded}
            title={expanded ? "Exit expanded view (Esc)" : "Fill the browser window"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            <span className="hidden sm:inline">{expanded ? "Exit" : "Expand"}</span>
          </button>
        )}
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className={button}
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          >
            {fullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
            <span className="hidden sm:inline">{fullscreen ? "Exit full screen" : "Full screen"}</span>
          </button>
        )}
      </div>
      <div className={large ? "relative min-h-0 flex-1" : "relative aspect-[4/3] w-full sm:aspect-video"}>{children}</div>
    </div>
  );
}
