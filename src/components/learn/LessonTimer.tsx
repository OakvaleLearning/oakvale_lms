"use client";

import { useEffect } from "react";

/** No mouse, key, scroll or touch for this long (and nothing playing) counts as away. */
const IDLE_MS = 5 * 60_000;
const FLUSH_EVERY_SEC = 30;

/**
 * Counts the time a learner actually spends on a lesson (page visible, not
 * idle) and reports it to /api/lms/progress/time. Renders nothing.
 *
 * Interaction inside an iframe (SCORM, embeds, documents) doesn't reach this
 * page, so focus on an iframe or a playing video/audio also counts as active.
 */
export function LessonTimer({ lessonId }: { lessonId: string }) {
  useEffect(() => {
    let pending = 0;
    let lastActivity = Date.now();

    const send = (keepalive: boolean) => {
      const seconds = Math.min(pending, 120);
      if (seconds < 1) return;
      pending -= seconds;
      fetch("/api/lms/progress/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, seconds }),
        keepalive,
      }).catch(() => {});
    };

    const active = () => {
      if (document.visibilityState !== "visible") return false;
      if (Date.now() - lastActivity < IDLE_MS) return true;
      if (document.activeElement?.tagName === "IFRAME") return true;
      return [...document.querySelectorAll<HTMLMediaElement>("video, audio")].some((m) => !m.paused && !m.ended);
    };

    const onActivity = () => {
      lastActivity = Date.now();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    const onPageHide = () => send(true);

    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    let sinceFlush = 0;
    const tick = setInterval(() => {
      if (!active()) return;
      pending += 1;
      sinceFlush += 1;
      if (sinceFlush >= FLUSH_EVERY_SEC) {
        sinceFlush = 0;
        send(false);
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      for (const e of events) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      // Moving to another lesson inside the app unmounts this; report what's left.
      send(true);
    };
  }, [lessonId]);

  return null;
}
