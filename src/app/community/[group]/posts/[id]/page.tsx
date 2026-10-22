import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getPost, listComments } from "@/lib/community/feed";
import { getMe } from "@/lib/community/viewer";
import { Breadcrumbs } from "@/components/dashboard/ui";
import { CommentThread } from "@/components/community/CommentThread";
import { PostCard } from "@/components/community/PostCard";

export const metadata: Metadata = { title: "Post · Community" };

export default async function PostPage({ params }: PageProps<"/community/[group]/posts/[id]">) {
  const { group, id } = await params;
  const session = await requireSession(`/community/${group}/posts/${id}`);
  const post = await getPost(session, id);
  if (!post) notFound();
  if (post.group.slug !== group) redirect(`/community/${post.group.slug}/posts/${id}`);

  const [me, comments] = await Promise.all([getMe(session), listComments(session, id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Breadcrumbs
        items={[
          { label: "Community", href: "/community" },
          { label: post.group.name, href: `/community/${post.group.slug}` },
          { label: "Post" },
        ]}
      />
      <PostCard post={post} detail />
      <CommentThread postId={post.id} comments={comments} me={me} locked={post.locked} isAdmin={session.role === "ADMIN"} />
    </div>
  );
}
