import "server-only";
import { prisma } from "@/lib/prisma";

/** Events still showing as "upcoming" for two hours after they start. */
const GRACE_MS = 2 * 60 * 60 * 1000;

const withRsvps = (userId: string) => ({
  rsvps: { where: { userId }, select: { status: true } },
  _count: { select: { rsvps: { where: { status: "GOING" as const } } } },
});

export function listUpcomingEvents(groupIds: string[], userId: string, take = 3) {
  return prisma.communityEvent.findMany({
    where: { groupId: { in: groupIds }, cancelledAt: null, startsAt: { gte: new Date(Date.now() - GRACE_MS) } },
    orderBy: { startsAt: "asc" },
    take,
    include: withRsvps(userId),
  });
}

export async function listGroupEvents(groupId: string, userId: string) {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const [upcoming, past] = await Promise.all([
    prisma.communityEvent.findMany({ where: { groupId, startsAt: { gte: cutoff } }, orderBy: { startsAt: "asc" }, include: withRsvps(userId) }),
    prisma.communityEvent.findMany({ where: { groupId, startsAt: { lt: cutoff } }, orderBy: { startsAt: "desc" }, take: 10, include: withRsvps(userId) }),
  ]);
  return { upcoming, past };
}

/** Whether an event is over, or about to start (the "Join now" window). */
export function eventTiming(event: { startsAt: Date; endsAt: Date | null }) {
  const now = Date.now();
  const past = (event.endsAt ?? event.startsAt).getTime() < now;
  return { past, live: !past && event.startsAt.getTime() - now < 15 * 60 * 1000 };
}

/** Activity over the last week, for the admin overview. */
export async function communityWeekStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [posts, comments, posters, commenters] = await Promise.all([
    prisma.post.count({ where: { deletedAt: null, createdAt: { gt: since } } }),
    prisma.comment.count({ where: { deletedAt: null, createdAt: { gt: since } } }),
    prisma.post.findMany({ where: { createdAt: { gt: since } }, distinct: ["authorId"], select: { authorId: true } }),
    prisma.comment.findMany({ where: { createdAt: { gt: since } }, distinct: ["authorId"], select: { authorId: true } }),
  ]);
  return { posts, comments, activeMembers: new Set([...posters, ...commenters].map((r) => r.authorId)).size };
}
