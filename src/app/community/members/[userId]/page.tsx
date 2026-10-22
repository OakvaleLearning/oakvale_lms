import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getMemberGroupIds, getMemberGroups, sharesGroup } from "@/lib/community/access";
import { AUTHOR_SELECT, toAuthor } from "@/lib/community/feed";
import { formatDate } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/dashboard/ui";
import { Avatar, TeamBadge } from "@/components/community/Avatar";
import { GroupThumb } from "@/components/community/Sidebar";
import { TimeAgo } from "@/components/community/TimeAgo";

export const metadata: Metadata = { title: "Member · Community" };

export default async function MemberPage({ params }: PageProps<"/community/members/[userId]">) {
  const { userId } = await params;
  const session = await requireSession(`/community/members/${userId}`);
  if (!(await sharesGroup(session, userId))) notFound();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...AUTHOR_SELECT, createdAt: true, communityProfile: { select: { avatar: true, headline: true, bio: true, location: true } } },
  });
  if (!user) notFound();
  const author = toAuthor(user);
  const isMe = user.id === session.userId;

  // Only groups both people are in, and only posts from those groups.
  const mine = new Set(await getMemberGroupIds(session));
  const theirs = (await getMemberGroups(user.id, user.role)).filter((g) => mine.has(g.id));
  const posts = await prisma.post.findMany({
    where: { authorId: user.id, deletedAt: null, groupId: { in: theirs.map((g) => g.id) } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, body: true, createdAt: true, commentCount: true, reactionCount: true, group: { select: { slug: true, name: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumbs items={[{ label: "Community", href: "/community" }, { label: author.name }]} />

      <section className="card overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-primary-600 to-primary-900 sm:h-28" />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <Avatar name={author.name} src={author.avatar} team={author.team} size="xl" className="ring-4 ring-white" />
            {isMe && (
              <ButtonLink href="/community/settings" variant="outline" size="sm">
                <Pencil className="size-4" /> Edit profile
              </ButtonLink>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight text-ink-950">{author.name}</h1>
            {author.team && <TeamBadge />}
          </div>
          {author.headline && <p className="mt-1 text-[15px] text-ink-600">{author.headline}</p>}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
            {user.communityProfile?.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> {user.communityProfile.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> Joined {formatDate(user.createdAt)}
            </span>
          </p>
          {user.communityProfile?.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">{user.communityProfile.bio}</p>}
          {isMe && !user.communityProfile?.bio && !author.avatar && (
            <p className="mt-4 text-sm text-ink-500">
              Add a photo and a short bio so other learners can get to know you.{" "}
              <Link href="/community/settings" className="font-medium text-primary-700 hover:underline">
                Complete your profile
              </Link>
            </p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-ink-950">Recent posts</h2>
          {posts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">{isMe ? "You haven't posted yet." : "No posts yet."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/community/${p.group.slug}/posts/${p.id}`} className="group block py-3">
                    <p className="line-clamp-2 text-sm leading-relaxed text-ink-800 group-hover:text-ink-950">{p.body}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      {p.group.name} · <TimeAgo iso={p.createdAt.toISOString()} /> · {p.commentCount} comments · {p.reactionCount} reactions
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-2">
          <h2 className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{isMe ? "Your groups" : "Groups in common"}</h2>
          <ul>
            {theirs.map((g) => (
              <li key={g.id}>
                <Link href={`/community/${g.slug}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  <GroupThumb group={g} />
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
