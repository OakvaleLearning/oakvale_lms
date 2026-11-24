import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import type { SessionPayload } from "@/lib/auth";

/**
 * The admin activity log: who did what, to which record, and when.
 *
 * Every admin operation calls `audit()` once it has succeeded (admin server
 * actions, admin API routes, community moderation, admin sign-ins). Rows are
 * only ever added; the actor's name and email are copied in so the record
 * survives the account being removed. Shown at /admin/activity.
 *
 * Logging never breaks the operation it records: a failed write is reported
 * to the server log instead.
 */

type Actor = Pick<SessionPayload, "userId" | "name" | "email">;

/** Groups for filtering, keyed by the part of the action before the dot. */
export const AUDIT_CATEGORIES = {
  content: { label: "Content", prefixes: ["program", "tier", "module", "topic", "lesson", "part", "quiz", "question", "cover", "order"] },
  preAssessment: { label: "Pre-assessments", prefixes: ["bank", "preAssessment"] },
  learners: { label: "Learners & enrolments", prefixes: ["enrolment", "learner"] },
  certificates: { label: "Certificates", prefixes: ["certificate", "template", "cpd"] },
  community: { label: "Community", prefixes: ["group", "event", "report", "post", "comment"] },
  support: { label: "Support", prefixes: ["support"] },
  team: { label: "Team", prefixes: ["admin"] },
  emails: { label: "Emails", prefixes: ["email"] },
  signIn: { label: "Sign-ins", prefixes: ["auth"] },
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export function categoryOf(action: string): AuditCategory | null {
  const prefix = action.split(".")[0];
  for (const [key, c] of Object.entries(AUDIT_CATEGORIES)) {
    if ((c.prefixes as readonly string[]).includes(prefix)) return key as AuditCategory;
  }
  return null;
}

/**
 * Record one admin operation.
 *
 *   await audit(admin, "tier.update", `Updated tier “Foundation”`, { target: ["tier", id], details: changes(before, after) });
 */
export async function audit(
  actor: Actor,
  action: string,
  summary: string,
  opts: { target?: [type: string, id: string]; details?: Record<string, unknown> | null } = {}
) {
  try {
    const ip = await clientIp().catch(() => null);
    await prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        actorName: actor.name.slice(0, 120),
        actorEmail: actor.email.slice(0, 200),
        action,
        summary: summary.slice(0, 500),
        targetType: opts.target?.[0] ?? null,
        targetId: opts.target?.[1] ?? null,
        details: opts.details && Object.keys(opts.details).length ? (opts.details as Prisma.InputJsonValue) : undefined,
        ip: ip && ip !== "unknown" ? ip.slice(0, 64) : null,
      },
    });
  } catch (err) {
    console.error("[audit] could not record", action, err);
  }
}

/**
 * The fields that changed between two versions of a record, as
 * `{ field: [before, after] }`. Only the listed fields are compared.
 */
export function changes<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T)[] = Object.keys(after)) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = before[f];
    const b = after[f];
    const same = Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b;
    if (!same) out[String(f)] = [a ?? null, b ?? null];
  }
  return out;
}

/** A price in kobo as naira, for summaries. */
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
