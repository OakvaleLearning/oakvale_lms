import "server-only";
import { cache } from "react";
import type { CommunityGroup, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEmailVerified, type SessionPayload } from "@/lib/auth";
import { RESERVED_GROUP_SLUGS } from "@/lib/validation";

/**
 * Community membership — the single place that decides who is in which group.
 *
 * Nothing is stored: a learner is a member of a group while they hold an
 * ACTIVE enrolment matching its audience, and have confirmed their email.
 *   ALL_PAID  any active enrolment
 *   PROGRAM   an active enrolment in a tier of that programme
 *   TIER      an active enrolment in that tier
 * So paying (or an admin grant) adds a learner straight away, and a cancelled
 * enrolment removes them. Site admins are in every group, shown as the Oakvale
 * Team. A group admin (GroupAdmin row) is always a member of that group, paid
 * or not, and can moderate it (see canManageGroup).
 */

type Viewer = Pick<SessionPayload, "userId" | "role">;
export type GroupSummary = Pick<CommunityGroup, "id" | "slug" | "name" | "description" | "coverImage" | "audience">;

const GROUP_SELECT = { id: true, slug: true, name: true, description: true, coverImage: true, audience: true } as const;

/** Groups the viewer belongs to, in display order. */
export const getMemberGroups = cache(async (userId: string, role: Viewer["role"]): Promise<GroupSummary[]> => {
  const order = [{ order: "asc" as const }, { createdAt: "asc" as const }];
  if (role === "ADMIN") {
    return prisma.communityGroup.findMany({ where: { archived: false }, orderBy: order, select: GROUP_SELECT });
  }
  if (!(await isEmailVerified(userId))) return [];

  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    select: { tierId: true, tier: { select: { programId: true } } },
  });

  return prisma.communityGroup.findMany({
    where: {
      archived: false,
      OR: [
        { admins: { some: { userId } } },
        { audience: "ALL_PAID" },
        { audience: "PROGRAM", programId: { in: enrolments.map((e) => e.tier.programId) } },
        { audience: "TIER", tierId: { in: enrolments.map((e) => e.tierId) } },
      ],
    },
    orderBy: order,
    select: GROUP_SELECT,
  });
});

export async function getMemberGroupIds(viewer: Viewer): Promise<string[]> {
  return (await getMemberGroups(viewer.userId, viewer.role)).map((g) => g.id);
}

export async function isGroupMember(viewer: Viewer, groupId: string): Promise<boolean> {
  return (await getMemberGroupIds(viewer)).includes(groupId);
}

/** Whether the viewer is in any group at all (i.e. may use the community). */
export async function hasCommunityAccess(viewer: Viewer): Promise<boolean> {
  return (await getMemberGroupIds(viewer)).length > 0;
}

/** Users who belong to a group, as a Prisma filter (for the member directory, notifications and emails). */
export function groupMemberWhere(group: Pick<CommunityGroup, "id" | "audience" | "programId" | "tierId">): Prisma.UserWhereInput {
  const active =
    group.audience === "PROGRAM"
      ? { status: "ACTIVE" as const, tier: { programId: group.programId ?? "" } }
      : group.audience === "TIER"
        ? { status: "ACTIVE" as const, tierId: group.tierId ?? "" }
        : { status: "ACTIVE" as const };
  return {
    OR: [
      { role: "ADMIN" },
      { role: "LEARNER", emailVerifiedAt: { not: null }, enrollments: { some: active } },
      { role: "LEARNER", emailVerifiedAt: { not: null }, groupAdminOf: { some: { groupId: group.id } } },
    ],
  };
}

/** Learners (not admins) in a group: who gets announcement notifications and digests. */
export function groupLearnerWhere(group: Pick<CommunityGroup, "id" | "audience" | "programId" | "tierId">): Prisma.UserWhereInput {
  return { AND: [groupMemberWhere(group), { role: "LEARNER" }] };
}

/** Whether two people share a group — viewing a profile needs one in common. */
export async function sharesGroup(viewer: Viewer, otherUserId: string): Promise<boolean> {
  if (viewer.role === "ADMIN" || viewer.userId === otherUserId) return true;
  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { role: true } });
  if (!other) return false;
  if (other.role === "ADMIN") return hasCommunityAccess(viewer);
  const mine = new Set(await getMemberGroupIds(viewer));
  const theirs = await getMemberGroupIds({ userId: otherUserId, role: other.role });
  return theirs.some((id) => mine.has(id));
}

/** Whether a group slug is reserved for a /community page or already used. */
export async function groupSlugTaken(slug: string): Promise<boolean> {
  if (RESERVED_GROUP_SLUGS.includes(slug)) return true;
  return Boolean(await prisma.communityGroup.findUnique({ where: { slug }, select: { id: true } }));
}

/**
 * Whether the viewer can moderate a group: a site admin, or a member the team
 * made that group's admin. Moderating means announcements, pinning, closing
 * comments, removing any post or comment, and appointing other group admins.
 */
export async function canManageGroup(viewer: Viewer, groupId: string): Promise<boolean> {
  if (viewer.role === "ADMIN") return true;
  const row = await prisma.groupAdmin.findUnique({
    where: { groupId_userId: { groupId, userId: viewer.userId } },
    select: { userId: true },
  });
  return Boolean(row);
}

/** Ids of the groups the viewer moderates, or "all" for a site admin. */
export async function managedGroupIds(viewer: Viewer): Promise<Set<string> | "all"> {
  if (viewer.role === "ADMIN") return "all";
  const rows = await prisma.groupAdmin.findMany({ where: { userId: viewer.userId }, select: { groupId: true } });
  return new Set(rows.map((r) => r.groupId));
}
