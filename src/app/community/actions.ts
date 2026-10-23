"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/auth";
import { HOUR, rateLimit } from "@/lib/rate-limit";
import { deletePrefix, ensureUploadCors, isStorageConfigured, presignUpload } from "@/lib/storage";
import { canManageGroup, getMemberGroupIds, groupMemberWhere, isGroupMember } from "@/lib/community/access";
import { postViewById } from "@/lib/community/feed";
import { markNotificationsRead, notifyComment, notifyGroup } from "@/lib/community/notifications";
import { avatarPrefix, postImagePrefix, type ActionResult, type PostView, type ReactionKind } from "@/lib/community/shared";
import { REACTION_KINDS, commentSchema, communityProfileSchema, postEditSchema, postSchema } from "@/lib/validation";

/**
 * Learner (and admin) community actions. Every action re-checks the session
 * and group membership; pages only render.
 */

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const fail = (error: string) => ({ ok: false as const, error });
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Invalid input";
const NOT_MEMBER = "You're not a member of this group.";

async function member(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  return (await getMemberGroupIds(session)).length > 0 ? session : null;
}

/* ------------------------------------------------------------------ *
 * Uploads (images go straight from the browser to the bucket)
 * ------------------------------------------------------------------ */

export async function createCommunityUpload(
  target: { purpose: "post" | "event"; groupId: string } | { purpose: "avatar" },
  file: { type: string; size: number }
): Promise<ActionResult<{ uploadUrl: string; key: string; contentType: string }>> {
  const session = await member();
  if (!session) return fail(NOT_MEMBER);
  if (!isStorageConfigured()) return fail("Image uploads aren't available yet.");

  let prefix: string;
  if (target.purpose === "avatar") {
    prefix = avatarPrefix(session.userId);
  } else {
    if (!(await isGroupMember(session, target.groupId))) return fail(NOT_MEMBER);
    if (target.purpose === "event" && session.role !== "ADMIN") return fail("Only the Oakvale team can add events.");
    prefix = postImagePrefix(target.groupId);
  }

  const ext = IMAGE_TYPES[String(file.type)];
  if (!ext) return fail("Please choose a JPG, PNG or WebP image.");
  if (!(file.size > 0) || file.size > MAX_IMAGE_BYTES) return fail("That image is too large (max 5 MB).");

  const limited = await rateLimit(`community:upload:${session.userId}`, 40, HOUR);
  if (!limited.ok) return fail("You've uploaded a lot of images recently. Please try again later.");

  const corsError = await ensureUploadCors(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").origin);
  if (corsError) return fail(corsError);

  const key = `${prefix}${randomUUID()}.${ext}`;
  return { ok: true, key, contentType: file.type, uploadUrl: await presignUpload(key, file.type) };
}

/* ------------------------------------------------------------------ *
 * Posts
 * ------------------------------------------------------------------ */

export async function createPost(input: {
  groupId: string;
  body: string;
  images?: string[];
  announcement?: boolean;
}): Promise<ActionResult<{ post: PostView }>> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { groupId, body, images, announcement } = parsed.data;

  if (!(await isGroupMember(session, groupId))) return fail(NOT_MEMBER);
  if (images.some((k) => !k.startsWith(postImagePrefix(groupId)) || k.includes(".."))) return fail("Invalid image.");
  if (announcement && !(await canManageGroup(session, groupId))) return fail("Only group admins can post announcements.");

  if (!(await canManageGroup(session, groupId))) {
    const limited = await rateLimit(`community:post:${session.userId}`, 10, HOUR);
    if (!limited.ok) return fail("You've posted a lot in the last hour. Please try again a little later.");
  }

  const post = await prisma.post.create({
    data: { groupId, authorId: session.userId, body, images, announcement, pinnedAt: announcement ? new Date() : null },
    include: { group: true },
  });
  if (announcement) await notifyGroup(post.group, "ANNOUNCEMENT", { actorId: session.userId, postId: post.id });
  return { ok: true, post: await postViewById(session, post.id) };
}

async function ownPostOrModerator(session: SessionPayload, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.deletedAt) return null;
  if (!(await isGroupMember(session, post.groupId))) return null;
  return { post, isAuthor: post.authorId === session.userId, isAdmin: await canManageGroup(session, post.groupId) };
}

export async function updatePost(postId: string, body: string): Promise<ActionResult<{ post: PostView }>> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const found = await ownPostOrModerator(session, postId);
  if (!found?.isAuthor) return fail("You can only edit your own posts.");
  const parsed = postEditSchema.safeParse({ body });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  await prisma.post.update({ where: { id: postId }, data: { body: parsed.data.body, editedAt: new Date() } });
  return { ok: true, post: await postViewById(session, postId) };
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const found = await ownPostOrModerator(session, postId);
  if (!found || !(found.isAuthor || found.isAdmin)) return fail("You can't delete this post.");
  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date(), pinnedAt: null } });
  await prisma.postReport.updateMany({ where: { postId, resolvedAt: null }, data: { resolvedAt: new Date() } });
  for (const key of found.post.images) await deletePrefix(key).catch((err) => console.error("[community] image cleanup failed:", err));
  return { ok: true };
}

/** Group admin: pin to the top of the group, or close comments. */
export async function setPostFlag(postId: string, flag: "pinned" | "locked", on: boolean): Promise<ActionResult<{ post: PostView }>> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const target = await prisma.post.findUnique({ where: { id: postId }, select: { groupId: true, deletedAt: true } });
  if (!target || target.deletedAt || !(await canManageGroup(session, target.groupId))) return fail("Only group admins can do that.");
  const field = flag === "pinned" ? "pinnedAt" : "lockedAt";
  await prisma.post.update({ where: { id: postId }, data: { [field]: on ? new Date() : null } });
  return { ok: true, post: await postViewById(session, postId) };
}

/* ------------------------------------------------------------------ *
 * Comments
 * ------------------------------------------------------------------ */

export async function addComment(postId: string, input: { body: string; parentId?: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const post = await prisma.post.findUnique({ where: { id: postId }, include: { group: { select: { slug: true } } } });
  if (!post || post.deletedAt || !(await isGroupMember(session, post.groupId))) return fail("This post isn't available.");
  if (post.lockedAt && !(await canManageGroup(session, post.groupId))) return fail("Comments are closed on this post.");

  // Replies attach to the top-level comment, so threads stay one level deep.
  let parent: { id: string; authorId: string } | null = null;
  if (parsed.data.parentId) {
    const p = await prisma.comment.findUnique({ where: { id: parsed.data.parentId } });
    if (!p || p.postId !== postId) return fail("That comment isn't available.");
    parent = p.parentId ? await prisma.comment.findUnique({ where: { id: p.parentId }, select: { id: true, authorId: true } }) : p;
    // Still notify the person being answered, even inside a thread.
    if (parent && p.parentId) parent = { id: parent.id, authorId: p.authorId };
  }

  if (session.role !== "ADMIN") {
    const limited = await rateLimit(`community:comment:${session.userId}`, 60, HOUR);
    if (!limited.ok) return fail("You've commented a lot in the last hour. Please try again a little later.");
  }

  await prisma.$transaction([
    prisma.comment.create({
      data: { postId, authorId: session.userId, body: parsed.data.body, parentId: parent?.id ?? null },
    }),
    prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 }, lastActivityAt: new Date() } }),
  ]);

  await notifyComment({
    actorId: session.userId,
    actorName: session.name,
    post: { id: post.id, authorId: post.authorId, body: post.body, group: post.group },
    comment: { body: parsed.data.body, parentAuthorId: parent?.authorId ?? null },
  });
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: { select: { groupId: true } } } });
  if (!comment || comment.deletedAt) return fail("That comment isn't available.");
  if (comment.authorId !== session.userId && !(await canManageGroup(session, comment.post.groupId))) return fail("You can't delete this comment.");
  if (!(await isGroupMember(session, comment.post.groupId))) return fail(NOT_MEMBER);

  await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
    prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }),
    prisma.postReport.updateMany({ where: { commentId, resolvedAt: null }, data: { resolvedAt: new Date() } }),
  ]);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Reactions: one per person per post/comment; the same kind again removes it
 * ------------------------------------------------------------------ */

export async function react(
  target: { postId: string } | { commentId: string },
  kind: ReactionKind | null
): Promise<ActionResult<{ mine: ReactionKind | null }>> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  if (kind && !REACTION_KINDS.includes(kind)) return fail("Unknown reaction.");

  const groupId =
    "postId" in target
      ? (await prisma.post.findUnique({ where: { id: target.postId }, select: { groupId: true, deletedAt: true } }))
      : (await prisma.comment.findUnique({ where: { id: target.commentId }, select: { deletedAt: true, post: { select: { groupId: true } } } }));
  if (!groupId || groupId.deletedAt) return fail("This isn't available any more.");
  const gid = "groupId" in groupId ? groupId.groupId : groupId.post.groupId;
  if (!(await isGroupMember(session, gid))) return fail(NOT_MEMBER);

  const where =
    "postId" in target
      ? { userId_postId: { userId: session.userId, postId: target.postId } }
      : { userId_commentId: { userId: session.userId, commentId: target.commentId } };
  const existing = await prisma.reaction.findUnique({ where });
  const postCounter = (by: number) =>
    "postId" in target ? [prisma.post.update({ where: { id: target.postId }, data: { reactionCount: { increment: by } } })] : [];

  if (!kind || existing?.kind === kind) {
    if (existing) await prisma.$transaction([prisma.reaction.delete({ where: { id: existing.id } }), ...postCounter(-1)]);
    return { ok: true, mine: null };
  }
  if (existing) {
    await prisma.reaction.update({ where: { id: existing.id }, data: { kind } });
  } else {
    const limited = await rateLimit(`community:react:${session.userId}`, 300, HOUR);
    if (!limited.ok) return fail("Slow down a little and try again shortly.");
    await prisma.$transaction([prisma.reaction.create({ data: { userId: session.userId, kind, ...target } }), ...postCounter(1)]);
  }
  return { ok: true, mine: kind };
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export async function rsvp(eventId: string, status: "GOING" | "MAYBE" | "NO" | null): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId } });
  if (!event || !(await isGroupMember(session, event.groupId))) return fail("This event isn't available.");
  if (event.cancelledAt) return fail("This event was cancelled.");
  if ((event.endsAt ?? event.startsAt) < new Date()) return fail("This event has already happened.");

  if (status === null) {
    await prisma.eventRsvp.deleteMany({ where: { eventId, userId: session.userId } });
  } else {
    await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId: session.userId } },
      create: { eventId, userId: session.userId, status },
      update: { status },
    });
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Profile, reports, notifications
 * ------------------------------------------------------------------ */

export async function saveProfile(_prev: { error?: string; ok?: boolean } | undefined, fd: FormData) {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const parsed = communityProfileSchema.safeParse({
    headline: String(fd.get("headline") ?? ""),
    location: String(fd.get("location") ?? ""),
    bio: String(fd.get("bio") ?? ""),
    notifyEmail: fd.get("notifyEmail") === "on",
    digest: fd.get("digest") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { digest, ...data } = parsed.data;
  await prisma.communityProfile.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, ...data, digestOptOut: !digest },
    update: { ...data, digestOptOut: !digest },
  });
  return { ok: true };
}

export async function saveAvatar(key: string | null): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  if (key !== null && (!key.startsWith(avatarPrefix(session.userId)) || key.includes(".."))) return fail("Invalid upload.");
  const current = await prisma.communityProfile.findUnique({ where: { userId: session.userId }, select: { avatar: true } });
  await prisma.communityProfile.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, avatar: key },
    update: { avatar: key },
  });
  if (current?.avatar && current.avatar !== key) {
    await deletePrefix(current.avatar).catch((err) => console.error("[community] avatar cleanup failed:", err));
  }
  return { ok: true };
}

export async function report(target: { postId: string } | { commentId: string }, reason: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  const text = reason.trim().slice(0, 500);
  if (!text) return fail("Tell us what's wrong.");

  const groupId =
    "postId" in target
      ? (await prisma.post.findUnique({ where: { id: target.postId }, select: { groupId: true } }))?.groupId
      : (await prisma.comment.findUnique({ where: { id: target.commentId }, select: { post: { select: { groupId: true } } } }))?.post.groupId;
  if (!groupId || !(await isGroupMember(session, groupId))) return fail("This isn't available any more.");

  const limited = await rateLimit(`community:report:${session.userId}`, 20, HOUR);
  if (!limited.ok) return fail("You've sent a lot of reports. Our team will review them shortly.");
  const already = await prisma.postReport.findFirst({ where: { reporterId: session.userId, resolvedAt: null, ...target } });
  if (!already) await prisma.postReport.create({ data: { reporterId: session.userId, reason: text, ...target } });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await getSession();
  if (session) await markNotificationsRead(session.userId);
}

/* ------------------------------------------------------------------ *
 * Group admins
 * ------------------------------------------------------------------ */

/**
 * Make a member of this group an admin of it, or take that away. Allowed for
 * site admins and the group's own admins. Site admins already moderate every
 * group, so they can't be listed.
 */
export async function setGroupAdmin(groupId: string, userId: string, on: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please log in again.");
  if (!(await canManageGroup(session, groupId))) return fail("Only group admins can do that.");

  const group = await prisma.communityGroup.findUnique({ where: { id: groupId }, select: { id: true, slug: true, audience: true, programId: true, tierId: true } });
  if (!group) return fail("That group isn't available.");

  if (on) {
    // Only people already in the group can be made its admin.
    const target = await prisma.user.findFirst({ where: { AND: [{ id: userId }, groupMemberWhere(group)] }, select: { id: true, role: true } });
    if (!target) return fail("Only members of this group can be made admins.");
    if (target.role === "ADMIN") return fail("They're already part of the Oakvale team, who can manage every group.");
    await prisma.groupAdmin.upsert({ where: { groupId_userId: { groupId, userId } }, create: { groupId, userId }, update: {} });
  } else {
    await prisma.groupAdmin.deleteMany({ where: { groupId, userId } });
  }
  revalidatePath(`/community/${group.slug}`);
  return { ok: true };
}
