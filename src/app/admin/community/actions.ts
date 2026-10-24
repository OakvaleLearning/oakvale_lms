"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { groupSlugTaken } from "@/lib/community/access";
import { notifyGroup } from "@/lib/community/notifications";
import { parseEventTime } from "@/lib/community/shared";
import { uniqueSlug } from "@/lib/utils";
import { communityEventSchema, communityGroupSchema } from "@/lib/validation";

/** Admin: community groups, events and the report queue. */

type State = { error?: string; ok?: boolean } | undefined;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");
const optional = (fd: FormData, name: string) => text(fd, name).trim() || undefined;
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Invalid input";
const isUniqueError = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

function refresh() {
  revalidatePath("/admin/community", "layout");
  revalidatePath("/community", "layout");
}

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

function parseGroup(fd: FormData) {
  return communityGroupSchema.safeParse({
    name: text(fd, "title"),
    description: text(fd, "description"),
    audience: text(fd, "audience"),
    programId: optional(fd, "programId"),
    tierId: optional(fd, "tierId"),
  });
}

function audienceData(g: { audience: "ALL_PAID" | "PROGRAM" | "TIER"; programId?: string; tierId?: string }) {
  return {
    audience: g.audience,
    programId: g.audience === "PROGRAM" ? g.programId! : null,
    tierId: g.audience === "TIER" ? g.tierId! : null,
  };
}

export async function createGroup(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const parsed = parseGroup(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, description } = parsed.data;
  let id: string;
  try {
    const slug = await uniqueSlug(name, groupSlugTaken, "group");
    const max = await prisma.communityGroup.aggregate({ _max: { order: true } });
    const group = await prisma.communityGroup.create({
      data: { name, slug, description, ...audienceData(parsed.data), order: (max._max.order ?? -1) + 1 },
    });
    id = group.id;
  } catch (err) {
    if (isUniqueError(err)) return { error: "Another group was just saved with the same name. Try again." };
    throw err;
  }
  refresh();
  redirect(`/admin/community/groups/${id}`);
}

export async function updateGroup(id: string, _prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const parsed = parseGroup(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, description } = parsed.data;
  await prisma.communityGroup.update({ where: { id }, data: { name, description, ...audienceData(parsed.data) } });
  refresh();
  return { ok: true };
}

export async function setGroupArchived(id: string, archived: boolean): Promise<void> {
  await requireAdmin();
  await prisma.communityGroup.update({ where: { id }, data: { archived } });
  refresh();
}

export async function moveGroup(id: string, direction: -1 | 1): Promise<void> {
  await requireAdmin();
  const groups = await prisma.communityGroup.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = groups.findIndex((g) => g.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= groups.length) return;
  [groups[i], groups[j]] = [groups[j], groups[i]];
  await prisma.$transaction(groups.map((g, order) => prisma.communityGroup.update({ where: { id: g.id }, data: { order } })));
  refresh();
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

function parseEvent(groupId: string, fd: FormData) {
  return communityEventSchema.safeParse({
    groupId,
    title: text(fd, "title"),
    description: text(fd, "description"),
    startsAt: parseEventTime(text(fd, "startsAt")),
    endsAt: optional(fd, "endsAt") ? parseEventTime(text(fd, "endsAt")) : undefined,
    location: text(fd, "location"),
    meetingUrl: optional(fd, "meetingUrl"),
  });
}

export async function createEvent(groupId: string, _prev: State, fd: FormData): Promise<State> {
  const session = await requireAdmin();
  const group = await prisma.communityGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found." };
  const parsed = parseEvent(groupId, fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.startsAt < new Date()) return { error: "The start time is in the past." };

  const event = await prisma.communityEvent.create({
    data: { ...parsed.data, meetingUrl: parsed.data.meetingUrl ?? null, endsAt: parsed.data.endsAt ?? null, createdById: session.userId },
  });
  if (fd.get("notify") === "on") await notifyGroup(group, "EVENT_NEW", { actorId: session.userId, eventId: event.id });
  refresh();
  redirect(`/community/events/${event.id}`);
}

export async function updateEvent(eventId: string, _prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId } });
  if (!event) return { error: "Event not found." };
  const parsed = parseEvent(event.groupId, fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const moved = parsed.data.startsAt.getTime() !== event.startsAt.getTime();
  await prisma.communityEvent.update({
    where: { id: eventId },
    data: {
      ...parsed.data,
      meetingUrl: parsed.data.meetingUrl ?? null,
      endsAt: parsed.data.endsAt ?? null,
      // A new time means attendees should be reminded again.
      ...(moved ? { reminderSentAt: null } : {}),
    },
  });
  refresh();
  return { ok: true };
}

export async function setEventCancelled(eventId: string, cancelled: boolean): Promise<void> {
  await requireAdmin();
  await prisma.communityEvent.update({ where: { id: eventId }, data: { cancelledAt: cancelled ? new Date() : null } });
  refresh();
}

export async function deleteEvent(eventId: string): Promise<void> {
  await requireAdmin();
  const event = await prisma.communityEvent.delete({ where: { id: eventId }, include: { group: { select: { slug: true } } } });
  refresh();
  redirect(`/community/${event.group.slug}?tab=events`);
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

/** Remove the reported post/comment (and close every report on it), or dismiss the report. */
export async function resolveReport(reportId: string, action: "remove" | "dismiss"): Promise<void> {
  await requireAdmin();
  const report = await prisma.postReport.findUnique({ where: { id: reportId }, include: { comment: true } });
  if (!report) return;
  const now = new Date();

  if (action === "remove") {
    if (report.postId) {
      await prisma.post.update({ where: { id: report.postId }, data: { deletedAt: now, pinnedAt: null } });
      await prisma.postReport.updateMany({ where: { postId: report.postId, resolvedAt: null }, data: { resolvedAt: now } });
    } else if (report.comment) {
      if (!report.comment.deletedAt) {
        await prisma.$transaction([
          prisma.comment.update({ where: { id: report.comment.id }, data: { deletedAt: now } }),
          prisma.post.update({ where: { id: report.comment.postId }, data: { commentCount: { decrement: 1 } } }),
        ]);
      }
      await prisma.postReport.updateMany({ where: { commentId: report.comment.id, resolvedAt: null }, data: { resolvedAt: now } });
    }
  } else {
    await prisma.postReport.update({ where: { id: reportId }, data: { resolvedAt: now } });
  }
  refresh();
}
