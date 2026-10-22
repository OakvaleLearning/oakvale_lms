"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Loader2, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addComment, deleteComment, react } from "@/app/community/actions";
import { COMMENT_MAX_CHARS } from "@/lib/validation";
import type { AuthorView, CommentView, ReactionKind } from "@/lib/community/shared";
import { cn } from "@/lib/utils";
import { Avatar, TeamBadge } from "./Avatar";
import { Menu, type MenuItem } from "./Menu";
import { ReactionButton } from "./ReactionButton";
import { ReportPanel } from "./ReportPanel";
import { RichText } from "./RichText";
import { TimeAgo } from "./TimeAgo";

/** Comments under a post, with one level of replies. */
export function CommentThread({
  postId,
  comments,
  me,
  locked,
  isAdmin,
}: {
  postId: string;
  comments: CommentView[];
  me: AuthorView;
  locked: boolean;
  isAdmin: boolean;
}) {
  const canComment = !locked || isAdmin;
  return (
    <section aria-label="Comments" className="card p-5">
      <h2 className="text-sm font-semibold text-ink-950">
        Comments
      </h2>

      {comments.length > 0 && (
        <ol className="mt-4 space-y-5">
          {comments.map((c) => (
            <li key={c.id}>
              <Comment postId={postId} comment={c} me={me} canReply={canComment} />
              {c.replies.length > 0 && (
                <ol className="mt-4 space-y-4 border-l-2 border-line pl-4 sm:ml-12">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <Comment postId={postId} comment={r} me={me} canReply={canComment} replyTo={c.id} small />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      <div id="comment" className={cn("scroll-mt-24", comments.length > 0 ? "mt-6 border-t border-line pt-5" : "mt-4")}>
        {canComment ? (
          <CommentBox postId={postId} me={me} placeholder={comments.length ? "Add a comment…" : "Be the first to comment…"} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Lock className="size-4" /> Comments are turned off for this post.
          </p>
        )}
      </div>
    </section>
  );
}

function Comment({
  postId,
  comment,
  me,
  canReply,
  replyTo,
  small = false,
}: {
  postId: string;
  comment: CommentView;
  me: AuthorView;
  canReply: boolean;
  /** For a reply, the top-level comment it sits under. */
  replyTo?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [mine, setMine] = useState(comment.myReaction);
  const [count, setCount] = useState(comment.reactionCount);
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState("");

  async function onReact(kind: ReactionKind | null) {
    const before = { mine, count };
    setCount(count + (kind ? 1 : 0) - (mine ? 1 : 0));
    setMine(kind);
    const res = await react({ commentId: comment.id }, kind).catch(() => null);
    if (!res?.ok) {
      setMine(before.mine);
      setCount(before.count);
      setError(res?.error ?? "That didn't work. Try again.");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this comment?")) return;
    const res = await deleteComment(comment.id).catch(() => null);
    if (!res?.ok) return setError(res?.error ?? "That didn't work. Try again.");
    router.refresh();
  }

  if (comment.deleted) {
    return <p className="py-1 text-sm italic text-ink-400">This comment was deleted.</p>;
  }

  const items: MenuItem[] = [
    ...(comment.author.id !== me.id ? [{ label: "Report comment", icon: Flag, onSelect: () => setReporting(true) }] : []),
    ...(comment.canDelete ? [{ label: "Delete comment", icon: Trash2, onSelect: remove, danger: true }] : []),
  ];
  const authorHref = `/community/members/${comment.author.id}`;

  return (
    <div className="flex gap-3">
      <Link href={authorHref} className="shrink-0">
        <Avatar name={comment.author.name} src={comment.author.avatar} team={comment.author.team} size={small ? "sm" : "md"} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-canvas px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={authorHref} className="text-sm font-semibold text-ink-950 hover:underline">
                {comment.author.name}
              </Link>
              {comment.author.team && <TeamBadge />}
            </div>
            <RichText text={comment.body} className="mt-0.5 text-sm leading-relaxed text-ink-800" />
          </div>
          <Menu items={items} label="Comment options" />
        </div>
        <div className="mt-1 flex items-center gap-1 pl-1 text-xs text-ink-500">
          <TimeAgo iso={comment.createdAt} className="pr-1" />
          <ReactionButton mine={mine} onReact={onReact} size="sm" />
          {count > 0 && <span className="tabular-nums">{count}</span>}
          {canReply && (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="h-7 rounded-lg px-2 font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              Reply
            </button>
          )}
        </div>
        {error && <p className="mt-1 pl-1 text-xs text-accent-700">{error}</p>}
        {reporting && <ReportPanel target={{ commentId: comment.id }} onClose={() => setReporting(false)} />}
        {replying && (
          <div className="mt-3">
            <CommentBox
              postId={postId}
              me={me}
              parentId={replyTo ?? comment.id}
              replyingTo={comment.author.name}
              autoFocus
              onDone={() => setReplying(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CommentBox({
  postId,
  me,
  parentId,
  replyingTo,
  placeholder,
  autoFocus = false,
  onDone,
}: {
  postId: string;
  me: AuthorView;
  parentId?: string;
  replyingTo?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(replyingTo ? `@${replyingTo.split(" ")[0]} ` : "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [body]);

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setError("");
    const res = await addComment(postId, { body, parentId }).catch(() => ({ ok: false as const, error: "Your comment couldn't be sent. Try again." }));
    setSending(false);
    if (!res.ok) return setError(res.error);
    setBody("");
    onDone?.();
    router.refresh();
  }

  return (
    <div className="flex gap-3">
      <Avatar name={me.name} src={me.avatar} team={me.team} size={parentId ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-line bg-white shadow-card focus-within:border-primary-500 focus-within:ring-3 focus-within:ring-primary-100">
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape") onDone?.();
            }}
            rows={1}
            maxLength={COMMENT_MAX_CHARS}
            placeholder={placeholder ?? `Reply to ${replyingTo}…`}
            aria-label={parentId ? "Write a reply" : "Write a comment"}
            className="block w-full resize-none bg-transparent px-4 py-2.5 text-sm leading-relaxed text-ink-900 outline-none placeholder:text-ink-400"
          />
          {body.trim() && (
            <div className="flex items-center justify-between gap-2 px-3 pb-2">
              <span className="text-[11px] text-ink-400">Enter to send · Shift+Enter for a new line</span>
              <Button size="sm" onClick={send} disabled={sending} className="h-8">
                {sending ? <Loader2 className="size-4 animate-spin" /> : parentId ? "Reply" : "Comment"}
              </Button>
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-accent-700">{error}</p>}
      </div>
    </div>
  );
}
