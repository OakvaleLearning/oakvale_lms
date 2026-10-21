/**
 * Pre-launch mode (PRELAUNCH=true): enrolment and payment are open, but
 * learners can't open courses yet. Admins can build and preview content as
 * usual. Remove the variable (and redeploy) on launch day.
 */
export function isPrelaunch(): boolean {
  return process.env.PRELAUNCH === "true";
}

/** Opening day in Lagos time (LAUNCH_DATE=YYYY-MM-DD), used by the pre-launch emails. */
const DEFAULT_LAUNCH_DATE = "2026-11-02";
const LAGOS_OFFSET = "+01:00";

/** Midnight in Lagos at the start of launch day. */
export function launchDate(): Date {
  const raw = process.env.LAUNCH_DATE?.trim() || DEFAULT_LAUNCH_DATE;
  const date = new Date(`${raw}T00:00:00${LAGOS_OFFSET}`);
  return Number.isNaN(date.getTime()) ? new Date(`${DEFAULT_LAUNCH_DATE}T00:00:00${LAGOS_OFFSET}`) : date;
}

/** e.g. "Monday, November 2, 2026" — the style the email copy uses. */
export function formatLaunchDate(withYear = true): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "Africa/Lagos",
  }).format(launchDate());
}
