import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarClock, CalendarPlus, Megaphone, MessageCircle, Reply } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { listNotifications, markNotificationsRead } from "@/lib/community/notifications";
import { cn } from "@/lib/utils";
import { Breadcrumbs, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { Avatar } from "@/components/community/Avatar";
import { TimeAgo } from "@/components/community/TimeAgo";
import { NotificationsRead } from "@/components/community/NotificationsRead";

export const metadata: Metadata = { title: "Notifications · Community" };

const ICONS: Record<NotificationKind, React.ElementType> = {
  COMMENT_ON_POST: MessageCircle,
  REPLY: Reply,
  EVENT_NEW: CalendarPlus,
  EVENT_REMINDER: CalendarClock,
  ANNOUNCEMENT: Megaphone,
};

export default async function NotificationsPage() {
  const session = await requireSession("/community/notifications");
  const items = await listNotifications(session.userId);
  // Marked read on view; the list above was read first so new ones still stand out.
  await markNotificationsRead(session.userId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Community", href: "/community" }, { label: "Notifications" }]} />
      <PageHeader title="Notifications" description="Replies to your posts and comments, announcements and events." />
      <NotificationsRead />

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up">
          When someone comments on your post or the Oakvale team shares an update, you&apos;ll see it here.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <li key={n.id}>
                <Link href={n.href} className={cn("flex gap-3 px-5 py-4 transition-colors hover:bg-ink-50", !n.read && "bg-primary-50/50")}>
                  <span className="relative shrink-0">
                    {n.actor ? (
                      <Avatar name={n.actor.name} src={n.actor.avatar} team={n.actor.team} />
                    ) : (
                      <span className="grid size-10 place-items-center rounded-full bg-primary-100 text-primary-700">
                        <Icon className="size-4" />
                      </span>
                    )}
                    {n.actor && (
                      <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-primary-700 shadow-card ring-1 ring-line">
                        <Icon className="size-3" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink-800">
                      {n.actor && <strong className="font-semibold text-ink-950">{n.actor.name} </strong>}
                      {n.text}
                    </span>
                    {n.snippet && <span className="mt-0.5 block truncate text-sm text-ink-500">{n.snippet}</span>}
                    <TimeAgo iso={n.createdAt} className="mt-1 block text-xs text-ink-400" />
                  </span>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
