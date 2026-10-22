"use client";

import { useEffect } from "react";

/** Fired after notifications are marked read, so the sidebar badge recounts. */
export const COMMUNITY_READ_EVENT = "community:read";

export function NotificationsRead() {
  useEffect(() => {
    window.dispatchEvent(new Event(COMMUNITY_READ_EVENT));
  }, []);
  return null;
}
