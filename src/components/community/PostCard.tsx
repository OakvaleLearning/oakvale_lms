"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Link2, Lock, LockOpen, Megaphone, MessageCircle, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/TextField";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { deletePost, react, setPostFlag, updatePost } from "@/app/community/actions";
import { POST_MAX_CHARS } from "@/lib/validation";
import type { PostView, ReactionKind } from "@/lib/community/shared";
import { cn } from "@/lib/utils";
import { Avatar, TeamBadge } from "./Avatar";
import { Menu, type MenuItem } from "./Menu";
import { ReactionButton, ReactionSummary } from "./ReactionButton";
import { ReportPanel } from "./ReportPanel";
import { RichText } from "./RichText";
import { TimeAgo } from "./TimeAgo";

export const postHref = (post: Pick<PostView, "id" | "group">) => `/community/${post.group.slug}/posts/${post.id}`;

/** Apply a reaction change to a post locally, before the server confirms. */
function withReaction(post: PostView, kind: ReactionKind | null): PostView {
  const delta = (kind ? 1 : 0) - (post.myReaction ? 1 : 0);
  const others = post.reactionCount - (post.myReaction ? 1 : 0);
  // With nobody else reacting, the summary is just the viewer's kind; otherwise add it to what's there.
  const topReactions =
    others === 0 ? (kind ? [kind] : []) : kind && !post.topReactions.includes(kind) ? [...post.topReactions, kind].slice(-3) : post.topReactions;
  return { ...post, myReaction: kind, reactionCount: Math.max(0, post.reactionCount + delta), topReactions };
}

export function PostCard({
  post: initial,
  showGroup = false,
  detail = false,
  onRemoved,
  onChange,
}: {
  post: PostView;
  showGroup?: boolean;
  /** On the post's own page: full text, no "view comments" link. */
  detail?: boolean;
  onRemoved?: (id: string) => void;
  onChange?: (post: PostView) => void;
}) {
  const router = useRouter();
  const [post, setPostState] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(detail);

  // A router refresh brings a newer copy from the server; adopt it.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setPostState(initial);
  }

  const setPost = (next: PostView) => {
    setPostState(next);
    onChange?.(next);
  };

  async function onReact(kind: ReactionKind | null) {
    const before = post;
    setPost(withReaction(post, kind));
    const res = await react({ postId: post.id }, kind).catch(() => null);
    if (!res?.ok) {
      setPost(before);
      setError(res?.error ?? "That didn't work. Try again.");
    }
  }

  async function run(action: () => Promise<{ ok: true; post?: PostView } | { ok: false; error: string }>) {
    setBusy(true);
    setError("");
    const res = await action().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!res.ok) return setError(res.error), false;
    if (res.post) setPost(res.post);
    return true;
  }

  async function saveEdit() {
    if (await run(() => updatePost(post.id, draft))) setEditing(false);
  }

  async function remove() {
    setConfirmingDelete(false);
    if (await run(() => deletePost(post.id))) {
      if (onRemoved) onRemoved(post.id);
      else router.push(`/community/${post.group.slug}`);
    }
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(`${window.location.origin}${postHref(post)}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const items: MenuItem[] = [
    ...(post.canEdit ? [{ label: "Edit post", icon: Pencil, onSelect: () => (setDraft(post.body), setEditing(true)) }] : []),
    ...(post.canModerate
      ? [
          {
            label: post.pinned ? "Unpin" : "Pin to top",
            icon: post.pinned ? PinOff : Pin,
            onSelect: () => run(() => setPostFlag(post.id, "pinned", !post.pinned)),
          },
          {
            label: post.locked ? "Turn comments on" : "Turn comments off",
            icon: post.locked ? LockOpen : Lock,
            onSelect: () => run(() => setPostFlag(post.id, "locked", !post.locked)),
          },
        ]
      : []),
    { label: copied ? "Link copied" : "Copy link", icon: Link2, onSelect: copyLink },
    ...(!post.canEdit ? [{ label: "Report post", icon: Flag, onSelect: () => setReporting(true) }] : []),
    ...(post.canEdit || post.canModerate ? [{ label: "Delete post", icon: Trash2, onSelect: () => setConfirmingDelete(true), danger: true }] : []),
  ];

  const long = post.body.length > 600 || post.body.split("\n").length > 10;
  const authorHref = `/community/members/${post.author.id}`;

  return (
    <article className={cn("card overflow-visible", post.announcement && "border-amber-200 ring-1 ring-amber-100")}>
      {(post.pinned || post.announcement) && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-t-2xl border-b px-5 py-2 text-xs font-medium",
            post.announcement ? "border-amber-100 bg-amber-50 text-amber-800" : "border-line bg-canvas text-ink-600"
          )}
        >
          {post.announcement ? <Megaphone className="size-3.5" /> : <Pin className="size-3.5" />}
          {post.announcement ? "Announcement" : "Pinned"}
        </div>
      )}

      <div className="p-5">
        <header className="flex items-start gap-3">
          <Link href={authorHref} className="shrink-0">
            <Avatar name={post.author.name} src={post.author.avatar} team={post.author.team} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={authorHref} className="text-sm font-semibold text-ink-950 hover:underline">
                {post.author.name}
              </Link>
              {post.author.team && <TeamBadge />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-500">
              {post.author.headline && !post.author.team && <span className="max-w-56 truncate">{post.author.headline} ·</span>}
              <Link href={postHref(post)} className="hover:underline">
                <TimeAgo iso={post.createdAt} />
              </Link>
              {post.edited && <span>· edited</span>}
              {showGroup && (
                <>
                  <span>·</span>
                  <Link href={`/community/${post.group.slug}`} className="font-medium text-ink-700 hover:underline">
                    {post.group.name}
                  </Link>
                </>
              )}
            </div>
          </div>
          <Menu items={items} label="Post options" />
        </header>

        {confirmingDelete && (
          <InlineConfirm
            message="Delete this post? This can't be undone."
            confirmLabel="Delete"
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={remove}
            className="mt-3 rounded-lg bg-accent-50 px-3 py-2"
          />
        )}

        {editing ? (
          <div className="mt-4 space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(14, Math.max(3, draft.split("\n").length + 1))}
              maxLength={POST_MAX_CHARS}
              aria-label="Edit post"
              className="block w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-ink-900 outline-none focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={busy || !draft.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <RichText
              text={post.body}
              className={cn("text-[15px] leading-relaxed text-ink-800", long && !expanded && "line-clamp-[8]")}
            />
            {long && !expanded && (
              <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-sm font-medium text-ink-500 hover:text-ink-900">
                See more
              </button>
            )}
          </div>
        )}

        {post.images.length > 0 && <ImageGrid images={post.images} />}

        {error && (
          <div className="mt-4">
            <FormError>{error}</FormError>
          </div>
        )}

        {(post.reactionCount > 0 || post.commentCount > 0) && (
          <div className="mt-4 flex items-center justify-between">
            <ReactionSummary kinds={post.topReactions} count={post.reactionCount} />
            {post.commentCount > 0 && (
              <Link href={postHref(post)} className="text-xs text-ink-500 hover:text-ink-900 hover:underline">
                {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
              </Link>
            )}
          </div>
        )}

        <footer className="-mx-2 mt-3 flex items-center gap-1 border-t border-line pt-2">
          <ReactionButton mine={post.myReaction} onReact={onReact} />
          {detail ? (
            <a
              href="#comment"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <MessageCircle className="size-4" /> Comment
            </a>
          ) : (
            <Link
              href={`${postHref(post)}#comment`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <MessageCircle className="size-4" /> Comment
            </Link>
          )}
          {post.locked && (
            <span className="ml-auto inline-flex items-center gap-1.5 pr-2 text-xs text-ink-500">
              <Lock className="size-3.5" /> Comments off
            </span>
          )}
        </footer>

        {reporting && <ReportPanel target={{ postId: post.id }} onClose={() => setReporting(false)} />}
      </div>
    </article>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  return (
    <div
      className={cn(
        "-mx-5 mt-4 grid gap-0.5 overflow-hidden bg-line sm:mx-0 sm:rounded-xl",
        images.length === 1 ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {images.map((src, i) => (
        <a
          key={src}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "relative block bg-ink-50",
            images.length === 1 ? "max-h-[520px]" : "aspect-square",
            images.length === 3 && i === 0 && "row-span-2 aspect-auto"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- access-checked media redirects */}
          <img src={src} alt="" loading="lazy" className={cn("size-full object-cover", images.length === 1 && "max-h-[520px]")} />
        </a>
      ))}
    </div>
  );
}
