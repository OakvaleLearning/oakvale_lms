import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EMAIL_BATCH_SIZE, sendEmail, sendEmailBatch } from "@/lib/email";
import { TEAM, appUrl, button, escape, layout, p } from "@/lib/email-templates";
import { groupLearnerWhere } from "./access";
import { formatEventTime } from "./shared";

/**
 * Community emails:
 *  - an instant note when someone comments on your post or replies to you,
 *  - a reminder the day before an event you RSVP'd to,
 *  - a weekly "what you missed" digest on Mondays.
 * Reminders and the digest run from the daily cron (runCommunityEmails).
 */

const DAY = 24 * 60 * 60 * 1000;
const pause = () => new Promise((r) => setTimeout(r, 600)); // Resend: 2 requests/second

const quote = (text: string) =>
  `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c7c4f0;background:#f7f7fb;border-radius:8px;font-size:14px;line-height:1.6;color:#3f3f46;">${escape(text)}</blockquote>`;

/* ------------------------------------------------------------------ *
 * Unsubscribe links (digest only)
 * ------------------------------------------------------------------ */

function sign(userId: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`digest:${userId}`).digest("base64url");
}

export function digestUnsubscribeUrl(userId: string) {
  return `${appUrl()}/api/community/unsubscribe?u=${encodeURIComponent(userId)}&s=${sign(userId)}`;
}

export function verifyUnsubscribe(userId: string, signature: string): boolean {
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const settingsLine = (userId?: string) => {
  const url = `${appUrl()}/community/settings`;
  const unsubscribe = userId ? ` · <a href="${digestUnsubscribeUrl(userId)}" style="color:#71717a;">Unsubscribe from the weekly digest</a>` : "";
  return `<p style="margin:24px 0 0;font-size:12px;color:#71717a;">Change which emails you get in <a href="${url}" style="color:#71717a;">community settings</a>${unsubscribe}.</p>`;
};

/* ------------------------------------------------------------------ *
 * Instant: comments and replies
 * ------------------------------------------------------------------ */

export async function sendCommentEmail(
  user: { name: string; email: string },
  info: { actorName: string; kind: "COMMENT_ON_POST" | "REPLY"; comment: string; postSnippet: string; link: string }
): Promise<boolean> {
  const link = `${appUrl()}${info.link}`;
  const what = info.kind === "REPLY" ? "replied to your comment" : "commented on your post";
  const subject = `${info.actorName} ${what}`;

  const bodyHtml =
    p(`Hi ${escape(user.name.split(" ")[0])},`) +
    p(`<strong>${escape(info.actorName)}</strong> ${what}${info.postSnippet ? ` on “${escape(info.postSnippet)}”` : ""}:`) +
    quote(info.comment) +
    button(link, "View the conversation") +
    settingsLine();

  const text = `Hi ${user.name.split(" ")[0]},

${info.actorName} ${what}:

"${info.comment}"

View the conversation: ${link}

Change which emails you get: ${appUrl()}/community/settings`;

  return sendEmail({ to: user.email, subject, html: layout(subject, bodyHtml), text });
}

/* ------------------------------------------------------------------ *
 * Scheduled: event reminders and the weekly digest
 * ------------------------------------------------------------------ */

/** Events starting in the next ~36 hours whose reminder hasn't gone out; each is claimed before sending. */
async function sendEventReminders(now: Date) {
  const events = await prisma.communityEvent.findMany({
    where: { reminderSentAt: null, cancelledAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 1.5 * DAY) } },
    include: {
      group: { select: { name: true } },
      rsvps: { where: { status: { in: ["GOING", "MAYBE"] } }, include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  let sent = 0;
  for (const event of events) {
    const claimed = await prisma.communityEvent.updateMany({ where: { id: event.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0 || event.rsvps.length === 0) continue;

    await prisma.notification.createMany({
      data: event.rsvps.map((r) => ({ userId: r.userId, kind: "EVENT_REMINDER" as const, eventId: event.id })),
    });

    const link = `${appUrl()}/community/events/${event.id}`;
    const when = formatEventTime(event.startsAt);
    const where = event.meetingUrl ? "Online. The joining link is on the event page." : event.location;
    const emails = event.rsvps.map(({ user }) => {
      const bodyHtml =
        p(`Hi ${escape(user.name.split(" ")[0])},`) +
        p(`A quick reminder that <strong>${escape(event.title)}</strong> in ${escape(event.group.name)} is coming up.`) +
        p(`<strong>When:</strong> ${escape(when)}${where ? `<br/><strong>Where:</strong> ${escape(where)}` : ""}`) +
        button(link, "View event") +
        p(`See you there,<br/>${TEAM}`);
      const text = `Hi ${user.name.split(" ")[0]},

A quick reminder that ${event.title} in ${event.group.name} is coming up.

When: ${when}${where ? `\nWhere: ${where}` : ""}

View event: ${link}

See you there,
${TEAM}`;
      return { to: user.email, subject: `Reminder: ${event.title} on ${when}`, html: layout(event.title, bodyHtml), text };
    });

    for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE) {
      if (await sendEmailBatch(emails.slice(i, i + EMAIL_BATCH_SIZE))) sent += Math.min(EMAIL_BATCH_SIZE, emails.length - i);
      await pause();
    }
    console.info(`[community] reminder for "${event.title}" → ${event.rsvps.length} attendee(s)`);
  }
  return { events: events.length, sent };
}

/** ISO week key, e.g. "community-digest-2026-W43". */
export function digestKey(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `community-digest-${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface DigestPost {
  id: string;
  groupId: string;
  groupName: string;
  groupSlug: string;
  author: string;
  body: string;
  comments: number;
  reactions: number;
}

function digestEmail(
  user: { id: string; name: string; email: string },
  posts: DigestPost[],
  events: { id: string; title: string; startsAt: Date; groupName: string }[]
) {
  const first = user.name.split(" ")[0];
  const short = (t: string) => {
    const flat = t.replace(/\s+/g, " ").trim();
    return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
  };
  const postHtml = posts
    .map(
      (post) => `<tr><td style="padding:14px 0;border-top:1px solid #e4e4e7;">
        <div style="font-size:12px;color:#71717a;">${escape(post.groupName)} · ${escape(post.author)}</div>
        <a href="${appUrl()}/community/${post.groupSlug}/posts/${post.id}" style="display:block;margin-top:4px;font-size:15px;line-height:1.5;color:#18181b;text-decoration:none;">${escape(short(post.body))}</a>
        <div style="margin-top:6px;font-size:12px;color:#71717a;">${post.comments} comment${post.comments === 1 ? "" : "s"} · ${post.reactions} reaction${post.reactions === 1 ? "" : "s"}</div>
      </td></tr>`
    )
    .join("");
  const eventHtml = events
    .map(
      (e) =>
        `<li style="margin:0 0 8px;font-size:14px;color:#3f3f46;"><a href="${appUrl()}/community/events/${e.id}" style="color:#145c3f;font-weight:600;text-decoration:none;">${escape(e.title)}</a>, ${escape(formatEventTime(e.startsAt))} <span style="color:#71717a;">(${escape(e.groupName)})</span></li>`
    )
    .join("");

  const bodyHtml =
    p(`Hi ${escape(first)}, here's what's been happening in your Oakvale community this week.`) +
    (posts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">${postHtml}</table>` : "") +
    (events.length ? `<h2 style="margin:24px 0 12px;font-size:16px;color:#0f172a;">Coming up</h2><ul style="margin:0 0 16px;padding-left:18px;">${eventHtml}</ul>` : "") +
    button(`${appUrl()}/community`, "Join the conversation") +
    settingsLine(user.id);

  const text = `Hi ${first}, here's what's been happening in your Oakvale community this week.

${posts.map((post) => `• ${post.groupName} · ${post.author}: ${short(post.body)}\n  ${appUrl()}/community/${post.groupSlug}/posts/${post.id}`).join("\n\n")}
${events.length ? `\nComing up:\n${events.map((e) => `• ${e.title}, ${formatEventTime(e.startsAt)}`).join("\n")}\n` : ""}
Join the conversation: ${appUrl()}/community

Unsubscribe from the weekly digest: ${digestUnsubscribeUrl(user.id)}`;

  const top = posts[0];
  const subject = top ? `This week in your community: ${short(top.body).slice(0, 60).trim()}` : "Coming up in your Oakvale community";
  return { to: user.email, subject, html: layout("Your week in the community", bodyHtml), text };
}

/** Weekly digest: each learner gets the top posts from their groups and upcoming events, once per ISO week. */
export async function sendWeeklyDigest(now: Date, { timeBudgetMs = 200_000 } = {}) {
  const started = Date.now();
  const key = digestKey(now);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const groups = await prisma.communityGroup.findMany({ where: { archived: false } });

  const [posts, events] = await Promise.all([
    prisma.post.findMany({
      where: { deletedAt: null, createdAt: { gt: weekAgo }, groupId: { in: groups.map((g) => g.id) } },
      orderBy: [{ commentCount: "desc" }, { reactionCount: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { author: { select: { name: true, role: true } } },
    }),
    prisma.communityEvent.findMany({
      where: { cancelledAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) }, groupId: { in: groups.map((g) => g.id) } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  if (posts.length === 0 && events.length === 0) return { key, sent: 0, skipped: "nothing new" };

  const groupById = new Map(groups.map((g) => [g.id, g]));
  // Members of each group with activity, minus anyone opted out or already sent this week.
  const recipients = new Map<string, { id: string; name: string; email: string; groupIds: Set<string> }>();
  const activeGroupIds = new Set([...posts.map((p) => p.groupId), ...events.map((e) => e.groupId)]);
  for (const groupId of activeGroupIds) {
    const group = groupById.get(groupId)!;
    const members = await prisma.user.findMany({
      where: {
        AND: [groupLearnerWhere(group), { communityProfile: { isNot: { digestOptOut: true } } }, { emailDeliveries: { none: { key } } }],
      },
      select: { id: true, name: true, email: true },
    });
    for (const m of members) {
      const entry = recipients.get(m.id) ?? { ...m, groupIds: new Set<string>() };
      entry.groupIds.add(groupId);
      recipients.set(m.id, entry);
    }
  }

  const emails: { userId: string; email: ReturnType<typeof digestEmail> }[] = [];
  for (const r of recipients.values()) {
    const theirPosts: DigestPost[] = posts
      .filter((post) => r.groupIds.has(post.groupId) && post.authorId !== r.id)
      .slice(0, 5)
      .map((post) => {
        const group = groupById.get(post.groupId)!;
        return {
          id: post.id,
          groupId: post.groupId,
          groupName: group.name,
          groupSlug: group.slug,
          author: post.author.role === "ADMIN" ? `${post.author.name} (Oakvale Team)` : post.author.name,
          body: post.body,
          comments: post.commentCount,
          reactions: post.reactionCount,
        };
      });
    const theirEvents = events
      .filter((e) => r.groupIds.has(e.groupId))
      .slice(0, 5)
      .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, groupName: groupById.get(e.groupId)!.name }));
    if (theirPosts.length === 0 && theirEvents.length === 0) continue;
    emails.push({ userId: r.id, email: digestEmail(r, theirPosts, theirEvents) });
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE) {
    if (Date.now() - started > timeBudgetMs) break;
    const chunk = emails.slice(i, i + EMAIL_BATCH_SIZE);
    const claimed: typeof chunk = [];
    for (const item of chunk) {
      try {
        await prisma.emailDelivery.create({ data: { userId: item.userId, key } });
        claimed.push(item);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    if (claimed.length === 0) continue;
    if (await sendEmailBatch(claimed.map((c) => c.email))) {
      sent += claimed.length;
    } else {
      failed += claimed.length;
      await prisma.emailDelivery.deleteMany({ where: { key, userId: { in: claimed.map((c) => c.userId) } } });
    }
    await pause();
  }
  return { key, sent, failed, remaining: emails.length - sent - failed };
}

/** Called by the daily cron. The digest goes out on Mondays (UTC); `forceDigest` sends it any day. */
export async function runCommunityEmails({ now = new Date(), forceDigest = false }: { now?: Date; forceDigest?: boolean } = {}) {
  const reminders = await sendEventReminders(now);
  const digest = forceDigest || now.getUTCDay() === 1 ? await sendWeeklyDigest(now) : null;
  return { reminders, digest };
}
