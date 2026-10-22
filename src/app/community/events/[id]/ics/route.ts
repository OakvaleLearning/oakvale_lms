import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { appUrl } from "@/lib/email-templates";
import { isGroupMember } from "@/lib/community/access";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "Add to calendar": a one-event .ics file for members of the event's group. */
export async function GET(_req: Request, ctx: RouteContext<"/community/events/[id]/ics">) {
  const { id } = await ctx.params;
  const session = await getSession();
  const event = await prisma.communityEvent.findUnique({ where: { id }, include: { group: { select: { name: true } } } });
  if (!session || !event || !(await isGroupMember(session, event.groupId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ends = event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000);
  const link = `${appUrl()}/community/events/${event.id}`;
  const description = [event.description, event.meetingUrl ? `Join: ${event.meetingUrl}` : "", `Details: ${link}`].filter(Boolean).join("\n\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oakvale Learning//Community//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@oakvale-community`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(ends)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(event.meetingUrl ?? event.location ?? "")}`,
    `URL:${link}`,
    event.cancelledAt ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="oakvale-event.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
