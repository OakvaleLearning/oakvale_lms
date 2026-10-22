import Link from "next/link";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { listUpcomingEvents } from "@/lib/community/events";
import type { GroupSummary } from "@/lib/community/access";
import { eventDateParts, formatEventTime } from "@/lib/community/shared";
import { cn } from "@/lib/utils";

/** Groups the viewer is in, as a compact list with cover thumbnails. */
export function GroupList({ groups, activeId }: { groups: GroupSummary[]; activeId?: string }) {
  return (
    <section className="card p-2">
      <h2 className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Your groups</h2>
      <ul>
        {groups.map((g) => (
          <li key={g.id}>
            <Link
              href={`/community/${g.slug}`}
              aria-current={g.id === activeId ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                g.id === activeId ? "bg-primary-50 font-medium text-primary-900" : "text-ink-700 hover:bg-ink-50 hover:text-ink-950"
              )}
            >
              <GroupThumb group={g} />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GroupThumb({ group, className }: { group: Pick<GroupSummary, "name" | "coverImage">; className?: string }) {
  return (
    <span className={cn("relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary-100 text-primary-700", className)}>
      {group.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from /media redirects
        <img src={group.coverImage} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Users className="size-4" />
      )}
    </span>
  );
}

/** Next few events across the given groups. */
export async function UpcomingEvents({ groupIds, userId, title = "Upcoming events" }: { groupIds: string[]; userId: string; title?: string }) {
  const events = await listUpcomingEvents(groupIds, userId);

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
        <CalendarDays className="size-3.5" /> {title}
      </h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No events scheduled yet. We&apos;ll let you know when one is added.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((e) => {
            const { month, day } = eventDateParts(e.startsAt);
            const status = e.rsvps[0]?.status;
            return (
              <li key={e.id}>
                <Link href={`/community/events/${e.id}`} className="group flex gap-3">
                  <span className="grid w-11 shrink-0 place-items-center rounded-lg border border-line bg-white py-1 text-center leading-none">
                    <span className="text-[10px] font-semibold text-accent-600">{month}</span>
                    <span className="mt-0.5 font-display text-lg text-ink-950">{day}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900 group-hover:underline">{e.title}</span>
                    <span className="block text-xs text-ink-500">{formatEventTime(e.startsAt, { withDay: false })}</span>
                    <span className="block text-xs text-ink-500">
                      {status === "GOING" ? "You're going" : status === "MAYBE" ? "You might go" : `${e._count.rsvps} going`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function SidebarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-950">
      {children}
      <ArrowRight className="size-4 text-ink-400" />
    </Link>
  );
}
