import "server-only";
import type { Prisma } from "@prisma/client";
import { AUDIT_CATEGORIES, type AuditCategory } from "@/lib/audit";

/**
 * Filters for the admin activity log, read from the URL, shared by
 * /admin/activity and its CSV download. Days are Lagos days (WAT, UTC+1).
 */

type Param = string | string[] | undefined;
const one = (p: Param) => (typeof p === "string" ? p.trim() : "");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface AuditFilters {
  actor: string;
  category: AuditCategory | "";
  from: string;
  to: string;
  q: string;
  /** "type:id", e.g. "user:abc", from links on other admin pages. */
  target: string;
}

export function readAuditFilters(sp: Record<string, Param>): AuditFilters {
  const category = one(sp.category);
  return {
    actor: one(sp.actor).slice(0, 40),
    category: category in AUDIT_CATEGORIES ? (category as AuditCategory) : "",
    from: DAY.test(one(sp.from)) ? one(sp.from) : "",
    to: DAY.test(one(sp.to)) ? one(sp.to) : "",
    q: one(sp.q).slice(0, 100),
    target: /^[a-zA-Z]+:[\w-]{1,40}$/.test(one(sp.target)) ? one(sp.target) : "",
  };
}

export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.actor) and.push({ actorId: f.actor });
  if (f.category) {
    and.push({ OR: AUDIT_CATEGORIES[f.category].prefixes.map((p) => ({ action: { startsWith: `${p}.` } })) });
  }
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00+01:00`) } });
  if (f.to) and.push({ createdAt: { lt: new Date(new Date(`${f.to}T00:00:00+01:00`).getTime() + 86_400_000) } });
  if (f.q) {
    and.push({
      OR: [
        { summary: { contains: f.q, mode: "insensitive" } },
        { actorName: { contains: f.q, mode: "insensitive" } },
        { actorEmail: { contains: f.q, mode: "insensitive" } },
        { ip: { contains: f.q } },
      ],
    });
  }
  if (f.target) {
    const [targetType, targetId] = f.target.split(":");
    and.push({ targetType, targetId });
  }
  return and.length ? { AND: and } : {};
}

/** The filters as URL params, leaving out empty ones. */
export function auditParams(f: AuditFilters, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== "" && v !== undefined) params.set(k, String(v));
  return params;
}

/** e.g. "18 Nov 2026, 14:05:09" in Lagos time. */
export const auditTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
