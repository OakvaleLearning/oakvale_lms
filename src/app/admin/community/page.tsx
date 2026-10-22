import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowUpRight, Flag, MessagesSquare, Plus, Users, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { groupMemberWhere } from "@/lib/community/access";
import { communityWeekStats } from "@/lib/community/events";
import { cn, formatDate } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, StatCard } from "@/components/dashboard/ui";
import { ActionForm, Dialog, Field, MoveButtons, Panel, Textarea, TitleSlugFields } from "@/components/admin/forms";
import { AudienceFields } from "@/components/admin/AudienceFields";
import { GroupThumb } from "@/components/community/Sidebar";
import { createGroup, moveGroup, resolveReport } from "./actions";

export const metadata: Metadata = { title: "Community" };

const AUDIENCE_LABEL = { ALL_PAID: "Everyone enrolled", PROGRAM: "Programme", TIER: "Tier" } as const;

export default async function AdminCommunityPage() {
  await requireAdmin();
  const [groups, programs, week, reports] = await Promise.all([
    prisma.communityGroup.findMany({
      orderBy: [{ archived: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      include: {
        program: { select: { title: true } },
        tier: { select: { name: true, program: { select: { title: true } } } },
        _count: { select: { posts: { where: { deletedAt: null } } } },
      },
    }),
    prisma.program.findMany({
      orderBy: { order: "asc" },
      select: { id: true, title: true, tiers: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
    }),
    communityWeekStats(),
    prisma.postReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        reporter: { select: { name: true } },
        post: { select: { id: true, body: true, deletedAt: true, author: { select: { name: true } }, group: { select: { slug: true, name: true } } } },
        comment: {
          select: { id: true, body: true, post: { select: { id: true, group: { select: { slug: true, name: true } } } }, author: { select: { name: true } } },
        },
      },
    }),
  ]);
  const memberCounts = await Promise.all(groups.map((g) => prisma.user.count({ where: groupMemberWhere(g) })));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Engagement"
        title="Community"
        description="Groups fill themselves: learners join when their enrolment is active and leave if it's cancelled."
        actions={
          <>
            <ButtonLink href="/community" variant="outline" size="sm">
              Open community <ArrowUpRight className="size-4" />
            </ButtonLink>
            <Dialog
              title="New group"
              description="Choose who's in it. You can add a cover image next."
              trigger={
                <>
                  <Plus className="size-4" /> New group
                </>
              }
            >
              <ActionForm action={createGroup} submitLabel="Create group" footerClassName="justify-end">
                <TitleSlugFields titleLabel="Name" />
                <AudienceFields programs={programs} />
                <Field label="Description" optional>
                  <Textarea name="description" rows={3} placeholder="What this group is for" />
                </Field>
              </ActionForm>
            </Dialog>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Posts this week" value={week.posts} icon={MessagesSquare} />
        <StatCard label="Comments this week" value={week.comments} icon={MessagesSquare} />
        <StatCard label="Active members" value={week.activeMembers} icon={Users} hint="Posted or commented in the last 7 days" />
        <StatCard label="Open reports" value={reports.length} icon={Flag} />
      </div>

      <Panel title="Groups" flush>
        <ul className="divide-y divide-line">
          {groups.map((g, i) => (
            <li key={g.id} className={cn("flex items-center gap-4 px-5 py-4 sm:px-6", g.archived && "opacity-60")}>
              <GroupThumb group={g} className="size-10" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/community/groups/${g.id}`} className="font-medium text-ink-950 hover:underline">
                  {g.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {AUDIENCE_LABEL[g.audience]}
                  {g.program && ` · ${g.program.title}`}
                  {g.tier && ` · ${g.tier.program.title} (${g.tier.name})`}
                  {g.archived && " · Archived"}
                </p>
              </div>
              <div className="hidden text-right text-sm sm:block">
                <div className="tabular-nums text-ink-900">{memberCounts[i]} members</div>
                <div className="text-xs tabular-nums text-ink-500">{g._count.posts} posts</div>
              </div>
              {!g.archived && <MoveButtons onMove={moveGroup.bind(null, g.id)} />}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Reports" description="Posts and comments members have flagged. Removing hides it for everyone." flush>
        {reports.length === 0 ? (
          <p className="flex items-center gap-2 px-6 py-6 text-sm text-ink-500">
            <UsersRound className="size-4" /> Nothing to review.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((r) => {
              const target = r.post ?? r.comment;
              const group = r.post?.group ?? r.comment?.post.group;
              const postId = r.post?.id ?? r.comment?.post.id;
              return (
                <li key={r.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-500">
                        <span className="font-medium text-accent-700">{r.reason}</span> · reported by {r.reporter.name} · {formatDate(r.createdAt)}
                      </p>
                      <p className="mt-1.5 line-clamp-3 text-sm text-ink-800">
                        <span className="font-medium">{target?.author.name}:</span> {target?.body}
                      </p>
                      {group && postId && (
                        <Link href={`/community/${group.slug}/posts/${postId}`} className="mt-1 inline-block text-xs font-medium text-primary-700 hover:underline">
                          {r.comment ? "Comment" : "Post"} in {group.name} →
                        </Link>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={resolveReport.bind(null, r.id, "dismiss")}>
                        <button className="h-9 rounded-lg px-3 text-sm text-ink-600 hover:bg-ink-100">Dismiss</button>
                      </form>
                      <form action={resolveReport.bind(null, r.id, "remove")}>
                        <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-50 px-3 text-sm font-medium text-accent-700 hover:bg-accent-100">
                          <Archive className="size-4" /> Remove {r.comment ? "comment" : "post"}
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
