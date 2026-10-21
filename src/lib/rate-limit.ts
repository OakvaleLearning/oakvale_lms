import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limits stored in Postgres (no Redis needed at this
 * traffic). Each call records one attempt under `key`; once `limit` attempts
 * fall inside the window, further calls are refused until the oldest expires.
 * Old rows are pruned by the daily cron (pruneRateLimits).
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const since = new Date(Date.now() - windowMs);
  const recent = await prisma.rateLimitHit.findMany({
    where: { key, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: limit,
  });
  if (recent.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((recent[0].createdAt.getTime() + windowMs - Date.now()) / 1000));
    return { ok: false, retryAfterSec };
  }
  await prisma.rateLimitHit.create({ data: { key } });
  return { ok: true };
}

/** Several limits at once (e.g. per IP and per email); the first one exceeded wins. */
export async function rateLimitAll(rules: [key: string, limit: number, windowMs: number][]) {
  for (const [key, limit, windowMs] of rules) {
    const result = await rateLimit(key, limit, windowMs);
    if (!result.ok) return result;
  }
  return { ok: true as const };
}

/** The caller's IP address as seen by Vercel's proxy. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export function tooMany(retryAfterSec: number) {
  const minutes = Math.ceil(retryAfterSec / 60);
  const wait = minutes <= 1 ? "a minute" : `${minutes} minutes`;
  return NextResponse.json(
    { error: `Too many attempts. Please try again in ${wait}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Drop attempts older than a day; the longest window is an hour. */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * HOUR) } } });
  return count;
}
