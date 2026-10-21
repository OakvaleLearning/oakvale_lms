/**
 * Pre-launch mode (PRELAUNCH=true): enrolment and payment are open, but
 * learners can't open courses yet. Admins can build and preview content as
 * usual. Remove the variable (and redeploy) on launch day.
 */
export function isPrelaunch(): boolean {
  return process.env.PRELAUNCH === "true";
}
