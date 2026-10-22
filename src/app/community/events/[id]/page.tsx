import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CalendarDays, CalendarPlus, Clock, MapPin, Pencil, RotateCcw, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { isGroupMember } from "@/lib/community/access";
import { eventTiming } from "@/lib/community/events";
import { AUTHOR_SELECT, toAuthor } from "@/lib/community/feed";
import { formatEventTime } from "@/lib/community/shared";
import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/dashboard/ui";
import { DeleteButton, Dialog } from "@/components/admin/forms";
import { Avatar } from "@/components/community/Avatar";
import { EventForm } from "@/components/community/EventForm";
import { RichText } from "@/components/community/RichText";
import { RsvpButtons } from "@/components/community/RsvpButtons";
import { deleteEvent, setEventCancelled, updateEvent } from "@/app/admin/community/actions";

export const metadata: Metadata = { title: "Event · Community" };

export default async function EventPage({ params }: PageProps<"/community/events/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/community/events/${id}`);
  const event = await prisma.communityEvent.findUnique({
    where: { id },
    include: {
      group: { select: { id: true, slug: true, name: true } },
      rsvps: { where: { status: { in: ["GOING", "MAYBE"] } }, orderBy: { createdAt: "asc" }, include: { user: { select: AUTHOR_SELECT } } },
    },
  });
  if (!event || !(await isGroupMember(session, event.groupId))) notFound();

  const isAdmin = session.role === "ADMIN";
  const mine = (await prisma.eventRsvp.findUnique({ where: { eventId_userId: { eventId: id, userId: session.userId } } }))?.status ?? null;
  const { past, live } = eventTiming(event);
  const going = event.rsvps.filter((r) => r.status === "GOING");
  const maybe = event.rsvps.filter((r) => r.status === "MAYBE");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Community", href: "/community" },
          { label: event.group.name, href: `/community/${event.group.slug}?tab=events` },
          { label: event.title },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <article className="card overflow-hidden">
          <div className="border-b border-line bg-gradient-to-br from-primary-50 to-canvas px-6 py-8">
            <p className="flex items-center gap-2 text-sm font-medium text-primary-700">
              <CalendarDays className="size-4" /> {event.group.name}
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink-950 sm:text-[2.125rem]">{event.title}</h1>
            {event.cancelledAt && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent-50 px-3 py-1.5 text-sm font-medium text-accent-800">
                <Ban className="size-4" /> This event was cancelled
              </p>
            )}
          </div>

          <dl className="grid gap-4 border-b border-line px-6 py-5 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <Clock className="mt-0.5 size-4 shrink-0 text-ink-400" />
              <div>
                <dt className="sr-only">When</dt>
                <dd className="font-medium text-ink-900">{formatEventTime(event.startsAt)}</dd>
                {event.endsAt && <dd className="text-ink-500">until {formatEventTime(event.endsAt, { withDay: false })}</dd>}
              </div>
            </div>
            <div className="flex gap-3">
              {event.meetingUrl ? <Video className="mt-0.5 size-4 shrink-0 text-ink-400" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-ink-400" />}
              <div className="min-w-0">
                <dt className="sr-only">Where</dt>
                <dd className="font-medium text-ink-900">{event.meetingUrl ? "Online" : event.location || "To be confirmed"}</dd>
                {event.meetingUrl && event.location && <dd className="text-ink-500">{event.location}</dd>}
              </div>
            </div>
          </dl>

          <div className="px-6 py-6">
            {event.description ? (
              <RichText text={event.description} className="text-[15px] leading-relaxed text-ink-700" />
            ) : (
              <p className="text-sm text-ink-500">No description.</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas px-6 py-4">
              <Dialog
                title="Edit event"
                triggerVariant="outline"
                trigger={
                  <>
                    <Pencil className="size-4" /> Edit
                  </>
                }
              >
                <EventForm action={updateEvent.bind(null, event.id)} event={event} submitLabel="Save changes" />
              </Dialog>
              <form action={setEventCancelled.bind(null, event.id, !event.cancelledAt)}>
                <button className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900">
                  {event.cancelledAt ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
                  {event.cancelledAt ? "Restore event" : "Cancel event"}
                </button>
              </form>
              <span className="ml-auto">
                <DeleteButton onDelete={deleteEvent.bind(null, event.id)} confirmText="Delete this event and its RSVPs?" label="Delete" />
              </span>
            </div>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-8">
          {!event.cancelledAt && (
            <section className="card space-y-4 p-5">
              {past ? (
                <p className="text-sm text-ink-500">This event has ended.</p>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-ink-950">Are you going?</h2>
                  <RsvpButtons eventId={event.id} current={mine} />
                </>
              )}
              {event.meetingUrl && !past && (
                <ButtonLink href={event.meetingUrl} target="_blank" rel="noopener noreferrer" variant={live ? "primary" : "outline"} className="w-full">
                  <Video className="size-4" /> {live ? "Join now" : "Meeting link"}
                </ButtonLink>
              )}
              {!past && (
                <Link
                  href={`/community/events/${event.id}/ics`}
                  prefetch={false}
                  className="flex items-center justify-center gap-2 text-sm font-medium text-primary-700 hover:underline"
                >
                  <CalendarPlus className="size-4" /> Add to calendar
                </Link>
              )}
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink-950">
              {going.length} going{maybe.length ? ` · ${maybe.length} maybe` : ""}
            </h2>
            {event.rsvps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Be the first to RSVP.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {[...going, ...maybe].slice(0, 30).map((r) => {
                  const a = toAuthor(r.user);
                  return (
                    <li key={r.userId}>
                      <Link href={`/community/members/${a.id}`} className="flex items-center gap-2.5 text-sm text-ink-800 hover:underline">
                        <Avatar name={a.name} src={a.avatar} team={a.team} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        {r.status === "MAYBE" && <span className="text-xs text-ink-400">maybe</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
