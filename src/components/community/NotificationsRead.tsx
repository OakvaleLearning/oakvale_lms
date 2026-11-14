"use client";

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/app/community/actions";

/** Fired after notifications are marked read, so the sidebar badge recounts. */
export const COMMUNITY_READ_EVENT = "community:read";

/**
 * Marks the person's notifications read once the page is actually on screen (not during server render,
 * which prefetching can trigger early). The badge recounts only after the write has finished.
 */
export function NotificationsRead() {
  useEffect(() => {
    markAllNotificationsRead()
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event(COMMUNITY_READ_EVENT)));
  }, []);
  return null;
}
