import "server-only";
import { after } from "next/server";
import type { CommunityGroup, NotificationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HOUR, rateLimit } from "@/lib/rate-limit";
import { groupMemberWhere } from "./access";
import { AUTHOR_SELECT, toAuthor } from "./feed";
import { sendCommentEmail } from "./emails";
import type { AuthorView } from "./shared";

/**
 * In-app notifications (the bell in the sidebar), plus the instant email for
 * comments and replies. Announcements and new events notify a whole group.
 */

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  actor: AuthorView | null;
  text: string;
  /** A short quote of the post or the event title. */
  snippet: string;
  href: string;
  read: boolean;
  createdAt: string;
}

const snippet = (text: string, max = 90) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * After a comment: tell the post's author, and the parent comment's author
 * for a reply. Nobody is told about their own activity.
 */
export async function notifyComment(input: {
  actorId: string;
  actorName: string;
  post: { id: string; authorId: string; body: string; group: { slug: string } };
  comment: { body: string; parentAuthorId: string | null };
}) {
  const { actorId, post, comment } = input;
  const rows: { userId: string; kind: NotificationKind }[] = [];
  if (comment.parentAuthorId && comment.parentAuthorId !== actorId) {
    rows.push({ userId: comment.parentAuthorId, kind: "REPLY" });
  }
  if (post.authorId !== actorId && post.authorId !== comment.parentAuthorId) {
    rows.push({ userId: post.authorId, kind: "COMMENT_ON_POST" });
  }
  if (rows.length === 0) return;

  await prisma.notification.createMany({ data: rows.map((r) => ({ ...r, actorId, postId: post.id })) });

  // Email in the background, at most once an hour per person per post.
  after(async () => {
    const recipients = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) }, communityProfile: { isNot: { notifyEmail: false } } },
      select: { id: true, name: true, email: true },
    });
    for (const user of recipients) {
      const limited = await rateLimit(`community:email:${user.id}:${post.id}`, 1, HOUR);
      if (!limited.ok) continue;
      const kind = rows.find((r) => r.userId === user.id)!.kind;
      await sendCommentEmail(user, {
        actorName: input.actorName,
        kind: kind === "REPLY" ? "REPLY" : "COMMENT_ON_POST",
        comment: snippet(comment.body, 300),
        postSnippet: snippet(post.body),
        link: `/community/${post.group.slug}/posts/${post.id}`,
      });
    }
  });
}

/** Notify every member of a group (except the actor), e.g. an announcement or a new event. */
export async function notifyGroup(
  group: Pick<CommunityGroup, "audience" | "programId" | "tierId">,
  kind: NotificationKind,
  data: { actorId: string; postId?: string; eventId?: string }
) {
  const members = await prisma.user.findMany({
    where: { AND: [groupMemberWhere(group), { id: { not: data.actorId } }] },
    select: { id: true },
  });
  for (let i = 0; i < members.length; i += 1000) {
    await prisma.notification.createMany({
      data: members.slice(i, i + 1000).map((m) => ({ userId: m.id, kind, ...data })),
    });
  }
  return members.length;
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

const TEXT: Record<NotificationKind, string> = {
  COMMENT_ON_POST: "commented on your post",
  REPLY: "replied to your comment",
  EVENT_NEW: "added a new event",
  EVENT_REMINDER: "Reminder: an event you're attending starts soon",
  ANNOUNCEMENT: "posted an announcement",
};

export async function listNotifications(userId: string, take = 50): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: AUTHOR_SELECT },
      post: { select: { id: true, body: true, deletedAt: true, group: { select: { slug: true } } } },
      event: { select: { id: true, title: true } },
    },
  });
  return rows.flatMap((n) => {
    if (n.post?.deletedAt) return [];
    const href = n.post
      ? `/community/${n.post.group.slug}/posts/${n.post.id}`
      : n.event
        ? `/community/events/${n.event.id}`
        : "/community";
    return [
      {
        id: n.id,
        kind: n.kind,
        actor: n.actor && n.kind !== "EVENT_REMINDER" ? toAuthor(n.actor) : null,
        text: TEXT[n.kind],
        snippet: n.post ? snippet(n.post.body) : (n.event?.title ?? ""),
        href,
        read: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
      },
    ];
  });
}
