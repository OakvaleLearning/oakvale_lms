import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarPlus, Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { groupMemberWhere } from "@/lib/community/access";
import { AUTHOR_SELECT, listPinnedPosts, listPosts, toAuthor } from "@/lib/community/feed";
import { getMe, loadCommunity } from "@/lib/community/viewer";
import { listGroupEvents } from "@/lib/community/events";
import { eventDateParts, formatEventTime } from "@/lib/community/shared";
import { cn, formatDate } from "@/lib/utils";
import { Breadcrumbs } from "@/components/dashboard/ui";
import { Dialog } from "@/components/admin/forms";
import { inputClass } from "@/components/ui/TextField";
import { Avatar, TeamBadge } from "@/components/community/Avatar";
import { EventForm } from "@/components/community/EventForm";
import { Feed } from "@/components/community/Feed";
import { NotAMember } from "@/components/community/NotAMember";
import { GroupList, UpcomingEvents } from "@/components/community/Sidebar";
import { createEvent } from "@/app/admin/community/actions";

const TABS = [
  { id: "feed", label: "Feed" },
  { id: "events", label: "Events" },
  { id: "members", label: "Members" },
  { id: "about", label: "About" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MEMBERS_PAGE = 48;

export async function generateMetadata({ params }: PageProps<"/community/[group]">): Promise<Metadata> {
  const { group } = await params;
  const row = await prisma.communityGroup.findUnique({ where: { slug: group }, select: { name: true } });
  return { title: row ? `${row.name} · Community` : "Community" };
}

export default async function GroupPage({ params, searchParams }: PageProps<"/community/[group]">) {
  const { group: slug } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/community/${slug}`);
  const { groups, unverified } = await loadCommunity(session);

  const group = groups.find((g) => g.slug === slug);
  if (!group) {
    const exists = await prisma.communityGroup.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) notFound();
    return groups.length === 0 ? (
      <NotAMember unverified={unverified} />
    ) : (
      <div className="card mx-auto max-w-lg px-8 py-12 text-center">
        <h1 className="font-display text-2xl text-ink-950">This group is for another programme</h1>
        <p className="mt-2 text-sm text-ink-500">You can see the groups you belong to on the community home.</p>
        <Link href="/community" className="mt-6 inline-block text-sm font-medium text-primary-700 hover:underline">
          Back to community
        </Link>
      </div>
    );
  }

  const full = await prisma.communityGroup.findUniqueOrThrow({ where: { id: group.id } });
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "feed";
  const isAdmin = session.role === "ADMIN";
  const memberCount = await prisma.user.count({ where: groupMemberWhere(full) });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Community", href: "/community" }, { label: group.name }]} />

      <header className="card overflow-hidden">
        <div className="relative h-32 bg-white sm:h-44">
          {group.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element -- covers come from /media redirects
            <img src={group.coverImage} alt="" className="absolute inset-0 size-full object-cover" />
          )}
        </div>
        <div className="px-5 pb-0 pt-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight text-ink-950">{group.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                <Users className="size-4" /> {memberCount} {memberCount === 1 ? "member" : "members"}
              </p>
            </div>
            {isAdmin && (
              <Link href={`/admin/community/groups/${group.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                Manage group
              </Link>
            )}
          </div>
          <nav className="-mb-px mt-5 flex gap-1 overflow-x-auto" aria-label="Group sections">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={t.id === "feed" ? `/community/${slug}` : `/community/${slug}?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "border-b-2 px-3 pb-3 pt-1 text-sm font-medium whitespace-nowrap transition-colors",
                  tab === t.id ? "border-primary-600 text-ink-950" : "border-transparent text-ink-500 hover:text-ink-900"
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tab === "feed" && <FeedTab session={session} groupId={group.id} groupName={group.name} />}
          {tab === "events" && <EventsTab groupId={group.id} userId={session.userId} isAdmin={isAdmin} />}
          {tab === "members" && <MembersTab group={full} slug={slug} q={String(sp.q ?? "")} page={Number(sp.page) || 1} />}
          {tab === "about" && (
            <section className="card p-6">
              <h2 className="text-sm font-semibold text-ink-950">About this group</h2>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                {group.description || "A place for Oakvale learners to connect, share and learn together."}
              </p>
              <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-500">Who&apos;s here</dt>
                  <dd className="mt-0.5 text-ink-900">
                    {full.audience === "ALL_PAID" ? "Every enrolled Oakvale learner" : `Learners enrolled in ${group.name}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Created</dt>
                  <dd className="mt-0.5 text-ink-900">{formatDate(full.createdAt)}</dd>
                </div>
              </dl>
              <h3 className="mt-6 text-sm font-semibold text-ink-950">Community guidelines</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-600">
                <li>Be kind and respectful. Everyone is here to learn.</li>
                <li>Never share personal details about the people you care for.</li>
                <li>No advertising or spam.</li>
                <li>Use “Report” on anything that breaks these rules; the Oakvale team will review it.</li>
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-8">
          <GroupList groups={groups} activeId={group.id} />
          {tab !== "events" && <UpcomingEvents groupIds={[group.id]} userId={session.userId} title="Group events" />}
        </aside>
      </div>
    </div>
  );
}

async function FeedTab({ session, groupId, groupName }: { session: Awaited<ReturnType<typeof requireSession>>; groupId: string; groupName: string }) {
  const [me, pinned, feed] = await Promise.all([
    getMe(session),
    listPinnedPosts(session, groupId),
    listPosts(session, { groupId, excludePinned: true }),
  ]);
  return (
    <Feed
      me={me}
      groupId={groupId}
      groups={[{ id: groupId, name: groupName }]}
      pinned={pinned}
      initialPosts={feed.posts}
      initialCursor={feed.nextCursor}
      canAnnounce={session.role === "ADMIN"}
      uploadsEnabled={isStorageConfigured()}
    />
  );
}

async function EventsTab({ groupId, userId, isAdmin }: { groupId: string; userId: string; isAdmin: boolean }) {
  const { upcoming, past } = await listGroupEvents(groupId, userId);

  const list = (events: typeof upcoming) => (
    <ul className="space-y-3">
      {events.map((e) => {
        const { month, day } = eventDateParts(e.startsAt);
        const status = e.rsvps[0]?.status;
        return (
          <li key={e.id}>
            <Link href={`/community/events/${e.id}`} className="card group flex gap-4 p-4 transition-shadow hover:shadow-raised">
              <span className="grid w-14 shrink-0 place-items-center rounded-xl border border-line bg-canvas py-2 text-center leading-none">
                <span className="text-[11px] font-semibold text-accent-600">{month}</span>
                <span className="mt-1 font-display text-2xl text-ink-950">{day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-ink-950 group-hover:underline">{e.title}</span>
                  {e.cancelledAt && <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">Cancelled</span>}
                </span>
                <span className="mt-0.5 block text-sm text-ink-500">{formatEventTime(e.startsAt)}</span>
                <span className="mt-1 block text-xs text-ink-500">
                  {e.meetingUrl ? "Online" : e.location || "Details on the event page"} · {e._count.rsvps} going
                  {status === "GOING" ? " · You're going" : status === "MAYBE" ? " · Maybe" : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink-950">Upcoming</h2>
          {isAdmin && (
            <Dialog
              title="New event"
              description="Members can RSVP and get a reminder the day before."
              trigger={
                <>
                  <CalendarPlus className="size-4" /> New event
                </>
              }
            >
              <EventForm action={createEvent.bind(null, groupId)} submitLabel="Create event" />
            </Dialog>
          )}
        </div>
        {upcoming.length ? (
          list(upcoming)
        ) : (
          <div className="card flex items-center gap-3 p-5 text-sm text-ink-500">
            <CalendarDays className="size-5 text-ink-400" /> No upcoming events yet.
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl text-ink-950">Past events</h2>
          <div className="opacity-80">{list(past)}</div>
        </section>
      )}
    </div>
  );
}

async function MembersTab({
  group,
  slug,
  q,
  page,
}: {
  group: Parameters<typeof groupMemberWhere>[0];
  slug: string;
  q: string;
  page: number;
}) {
  const search = q.trim().slice(0, 80);
  const where = {
    AND: [
      groupMemberWhere(group),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { communityProfile: { is: { headline: { contains: search, mode: "insensitive" as const } } } },
                { communityProfile: { is: { location: { contains: search, mode: "insensitive" as const } } } },
              ],
            },
          ]
        : []),
    ],
  };
  const [total, members] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (page - 1) * MEMBERS_PAGE,
      take: MEMBERS_PAGE,
      select: { ...AUTHOR_SELECT, communityProfile: { select: { avatar: true, headline: true, location: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / MEMBERS_PAGE));
  const pageHref = (p: number) => `/community/${slug}?tab=members${search ? `&q=${encodeURIComponent(search)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <section className="space-y-4">
      <form action={`/community/${slug}`} className="relative">
        <input type="hidden" name="tab" value="members" />
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input name="q" defaultValue={search} placeholder="Search members by name, role or location" aria-label="Search members" className={cn(inputClass, "pl-10")} />
      </form>
      <p className="text-sm text-ink-500">
        {search ? `${total} ${total === 1 ? "match" : "matches"}` : `${total} ${total === 1 ? "member" : "members"}`}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const author = toAuthor(m);
          return (
            <li key={m.id}>
              <Link href={`/community/members/${m.id}`} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-raised">
                <Avatar name={author.name} src={author.avatar} team={author.team} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink-950">{author.name}</span>
                    {author.team && <TeamBadge />}
                  </span>
                  {(author.headline || m.communityProfile?.location) && (
                    <span className="block truncate text-xs text-ink-500">
                      {[author.team ? "" : author.headline, m.communityProfile?.location].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav className="flex items-center justify-between pt-2 text-sm" aria-label="Pages">
          {page > 1 ? <Link href={pageHref(page - 1)} className="font-medium text-primary-700 hover:underline">← Previous</Link> : <span />}
          <span className="text-ink-500">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className="font-medium text-primary-700 hover:underline">Next →</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
