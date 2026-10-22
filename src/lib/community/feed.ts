import "server-only";
import type { Prisma, ReactionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { getMemberGroupIds } from "./access";
import { mediaUrl, type AuthorView, type CommentView, type PostView } from "./shared";

type Viewer = Pick<SessionPayload, "userId" | "role">;

export const FEED_PAGE_SIZE = 20;
export const TEAM_NAME = "Oakvale Team";

export const AUTHOR_SELECT = {
  id: true,
  name: true,
  role: true,
  communityProfile: { select: { avatar: true, headline: true } },
} satisfies Prisma.UserSelect;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;

export function toAuthor(user: AuthorRow): AuthorView {
  const team = user.role === "ADMIN";
  return {
    id: user.id,
    name: user.name,
    avatar: user.communityProfile?.avatar ? mediaUrl(user.communityProfile.avatar) : null,
    headline: user.communityProfile?.headline || (team ? TEAM_NAME : ""),
    team,
  };
}

const POST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  group: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;

/** Shape rows for the client, with the viewer's own reaction and each post's top reaction kinds. */
async function toViews(viewer: Viewer, rows: PostRow[]): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [mine, kinds] = await Promise.all([
    prisma.reaction.findMany({ where: { userId: viewer.userId, postId: { in: ids } }, select: { postId: true, kind: true } }),
    prisma.reaction.groupBy({ by: ["postId", "kind"], where: { postId: { in: ids } }, _count: true }),
  ]);
  const myByPost = new Map(mine.map((r) => [r.postId!, r.kind]));
  const top = new Map<string, { kind: ReactionKind; n: number }[]>();
  for (const k of kinds) {
    const list = top.get(k.postId!) ?? [];
    list.push({ kind: k.kind, n: k._count });
    top.set(k.postId!, list);
  }

  return rows.map((r) => ({
    id: r.id,
    group: r.group,
    author: toAuthor(r.author),
    body: r.body,
    images: r.images.map(mediaUrl),
    announcement: r.announcement,
    pinned: Boolean(r.pinnedAt),
    locked: Boolean(r.lockedAt),
    commentCount: r.commentCount,
    reactionCount: r.reactionCount,
    topReactions: (top.get(r.id) ?? []).sort((a, b) => b.n - a.n).slice(0, 3).map((t) => t.kind),
    myReaction: myByPost.get(r.id) ?? null,
    createdAt: r.createdAt.toISOString(),
    edited: Boolean(r.editedAt),
    canEdit: r.authorId === viewer.userId,
    canModerate: viewer.role === "ADMIN",
  }));
}

/**
 * Newest posts first in the given groups (or every group the viewer is in).
 * `cursor` is the id of the last post already shown. Pinned posts are listed
 * separately on a group's feed, so they're left out there.
 */
export async function listPosts(
  viewer: Viewer,
  { groupId, cursor, excludePinned = false }: { groupId?: string; cursor?: string; excludePinned?: boolean }
): Promise<{ posts: PostView[]; nextCursor: string | null }> {
  const memberOf = await getMemberGroupIds(viewer);
  const groupIds = groupId ? memberOf.filter((id) => id === groupId) : memberOf;
  if (groupIds.length === 0) return { posts: [], nextCursor: null };

  const rows = await prisma.post.findMany({
    where: { groupId: { in: groupIds }, deletedAt: null, ...(excludePinned ? { pinnedAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_INCLUDE,
  });
  const page = rows.slice(0, FEED_PAGE_SIZE);
  return { posts: await toViews(viewer, page), nextCursor: rows.length > FEED_PAGE_SIZE ? page.at(-1)!.id : null };
}

export async function listPinnedPosts(viewer: Viewer, groupId: string): Promise<PostView[]> {
  const rows = await prisma.post.findMany({
    where: { groupId, deletedAt: null, pinnedAt: { not: null } },
    orderBy: { pinnedAt: "desc" },
    take: 5,
    include: POST_INCLUDE,
  });
  return toViews(viewer, rows);
}

/** How many posts appeared after `since` (for the "new posts" pill). */
export async function countNewPosts(viewer: Viewer, since: Date, groupId?: string): Promise<number> {
  const memberOf = await getMemberGroupIds(viewer);
  const groupIds = groupId ? memberOf.filter((id) => id === groupId) : memberOf;
  if (groupIds.length === 0) return 0;
  return prisma.post.count({
    where: { groupId: { in: groupIds }, deletedAt: null, createdAt: { gt: since }, authorId: { not: viewer.userId } },
  });
}

/** One post, if it exists and the viewer is in its group. */
export async function getPost(viewer: Viewer, postId: string): Promise<PostView | null> {
  const row = await prisma.post.findUnique({ where: { id: postId }, include: POST_INCLUDE });
  if (!row || row.deletedAt) return null;
  if (!(await getMemberGroupIds(viewer)).includes(row.groupId)) return null;
  return (await toViews(viewer, [row]))[0];
}

export async function postViewById(viewer: Viewer, postId: string): Promise<PostView> {
  const row = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: POST_INCLUDE });
  return (await toViews(viewer, [row]))[0];
}

/** A post's comments, oldest first, with replies nested under their comment. */
export async function listComments(viewer: Viewer, postId: string): Promise<CommentView[]> {
  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    include: { author: { select: AUTHOR_SELECT }, _count: { select: { reactions: true } } },
  });
  const mine = await prisma.reaction.findMany({
    where: { userId: viewer.userId, commentId: { in: rows.map((r) => r.id) } },
    select: { commentId: true, kind: true },
  });
  const myByComment = new Map(mine.map((r) => [r.commentId!, r.kind]));

  const views = new Map<string, CommentView>();
  for (const r of rows) {
    const deleted = Boolean(r.deletedAt);
    views.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      author: toAuthor(r.author),
      body: deleted ? "" : r.body,
      createdAt: r.createdAt.toISOString(),
      reactionCount: r._count.reactions,
      myReaction: myByComment.get(r.id) ?? null,
      deleted,
      canDelete: !deleted && (r.authorId === viewer.userId || viewer.role === "ADMIN"),
      replies: [],
    });
  }
  const top: CommentView[] = [];
  for (const view of views.values()) {
    const parent = view.parentId ? views.get(view.parentId) : null;
    if (parent) parent.replies.push(view);
    else top.push(view);
  }
  // A deleted comment stays as a placeholder only while it still has replies.
  return top.filter((c) => !c.deleted || c.replies.some((r) => !r.deleted)).map((c) => ({ ...c, replies: c.replies.filter((r) => !r.deleted) }));
}
