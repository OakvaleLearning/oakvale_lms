/**
 * What proctored pre-assessments record, shared by the learner's player, the
 * server and the admin review page.
 *
 * A "strike" is something a learner was told not to do. On the assessment's
 * `maxStrikes`-th strike the attempt ends and counts as a fail. The rest are
 * logged for an admin reviewing the attempt.
 */
export const PROCTOR_EVENTS = {
  // Reported by the learner's browser.
  HIDDEN: { label: "Left the page (switched tab, minimised or locked the screen)", strike: true },
  BLUR: { label: "Switched to another window or app", strike: true },
  FULLSCREEN_EXIT: { label: "Left full screen", strike: true },
  COPY: { label: "Tried to copy", strike: true },
  CUT: { label: "Tried to cut", strike: true },
  PASTE: { label: "Tried to paste", strike: true },
  CAMERA_OFF: { label: "Camera turned off or unplugged", strike: true },
  SHORTCUT: { label: "Pressed a blocked key (print, save, developer tools…)", strike: false },
  SECOND_SCREEN: { label: "A second screen is connected", strike: false },
  NO_FULLSCREEN: { label: "This browser can't go full screen (e.g. iPhone), so it wasn't required", strike: false },
  // Added by the server.
  STARTED: { label: "Started", strike: false },
  NEW_WINDOW: { label: "Opened in another tab, window or device, or the page was reloaded", strike: true },
  NEW_IP: { label: "Internet connection (IP address) changed", strike: false },
  OFFLINE: { label: "No contact from the browser for a while (offline or page closed)", strike: false },
  SUBMITTED: { label: "Submitted", strike: false },
  TIMED_OUT: { label: "Time ran out", strike: false },
  TERMINATED: { label: "Ended for too many strikes", strike: false },
} as const;

export type ProctorEventType = keyof typeof PROCTOR_EVENTS;

/** Events the browser may report (the rest are the server's own). */
export const CLIENT_EVENTS = [
  "HIDDEN",
  "BLUR",
  "FULLSCREEN_EXIT",
  "COPY",
  "CUT",
  "PASTE",
  "CAMERA_OFF",
  "SHORTCUT",
  "SECOND_SCREEN",
  "NO_FULLSCREEN",
] as const satisfies readonly ProctorEventType[];

export type ClientEventType = (typeof CLIENT_EVENTS)[number];

/** One entry of an attempt's proctoring log. */
export interface ProctorEvent {
  at: string; // ISO time, server clock
  type: ProctorEventType;
  strike?: boolean;
  detail?: string;
}

/** How often the browser saves answers and checks in, and how often it takes a webcam still. */
export const HEARTBEAT_MS = 15_000;
export const SNAPSHOT_EVERY_MS = 60_000;
/** Largest webcam still accepted (a 320×240 JPEG is ~15–30 KB). */
export const SNAPSHOT_MAX_BYTES = 200_000;
