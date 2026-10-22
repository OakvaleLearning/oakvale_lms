import Link from "next/link";
import { ArrowRight, MessageCircle, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { getMemberGroupIds } from "@/lib/community/access";
import { AUTHOR_SELECT, toAuthor } from "@/lib/community/feed";
import { Avatar } from "./Avatar";
import { TimeAgo } from "./TimeAgo";

/** "From the community" on the learner home: the two newest posts in their groups. */
export async function CommunityCard({ session }: { session: SessionPayload }) {
  const groupIds = await getMemberGroupIds(session);
  if (groupIds.length === 0) return null;
  const posts = await prisma.post.findMany({
    where: { groupId: { in: groupIds }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      id: true,
      body: true,
      createdAt: true,
      commentCount: true,
      author: { select: AUTHOR_SELECT },
      group: { select: { slug: true, name: true } },
    },
  });

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-xl text-ink-950">
          <UsersRound className="size-5 text-primary-600" /> From the community
        </h2>
        <Link href="/community" className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">
          Open <ArrowRight className="size-4" />
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          You&apos;re a member of the Oakvale Community.{" "}
          <Link href="/community" className="font-medium text-primary-700 hover:underline">
            Say hello
          </Link>{" "}
          to your fellow learners.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {posts.map((p) => {
            const a = toAuthor(p.author);
            return (
              <li key={p.id}>
                <Link href={`/community/${p.group.slug}/posts/${p.id}`} className="group flex h-full gap-3 rounded-xl border border-line bg-canvas p-4 transition-colors hover:border-ink-300 hover:bg-white">
                  <Avatar name={a.name} src={a.avatar} team={a.team} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink-500">
                      <span className="font-medium text-ink-800">{a.name}</span> · {p.group.name} · <TimeAgo iso={p.createdAt.toISOString()} />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-ink-800 group-hover:text-ink-950">{p.body}</span>
                    {p.commentCount > 0 && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-500">
                        <MessageCircle className="size-3.5" /> {p.commentCount}
                      </span>
                    )}
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
