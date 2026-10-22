"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Loader2, MessagesSquare } from "lucide-react";
import { EASE } from "@/components/motion";
import type { AuthorView, PostView } from "@/lib/community/shared";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";

const POLL_MS = 30_000;

/**
 * A group's (or the home) feed: composer, pinned posts, then newest first.
 * Loads older posts as you scroll, and shows a "new posts" pill when others post.
 */
export function Feed({
  me,
  groupId,
  groups,
  pinned = [],
  initialPosts,
  initialCursor,
  canAnnounce,
  uploadsEnabled,
  showGroup = false,
}: {
  me: AuthorView;
  /** Set on a group page; the home feed covers every group. */
  groupId?: string;
  groups: { id: string; name: string }[];
  pinned?: PostView[];
  initialPosts: PostView[];
  initialCursor: string | null;
  canAnnounce: boolean;
  uploadsEnabled: boolean;
  showGroup?: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const since = useRef(new Date().toISOString());

  const query = groupId ? `group=${encodeURIComponent(groupId)}&` : "";

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const res = await fetch(`/api/community/feed?${query}cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { posts: PostView[]; nextCursor: string | null };
      setPosts((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...data.posts.filter((p) => !ids.has(p.id))];
      });
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }, [cursor, loading, query]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  // Count posts others have shared since this page loaded.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const res = await fetch(`/api/community/feed?${query}since=${encodeURIComponent(since.current)}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as { count: number };
      setFresh(data.count);
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [query]);

  function showFresh() {
    since.current = new Date().toISOString();
    setFresh(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }

  // A refresh brings new server props; adopt them.
  const [seen, setSeen] = useState(initialPosts);
  if (seen !== initialPosts) {
    setSeen(initialPosts);
    setPosts(initialPosts);
    setCursor(initialCursor);
  }

  const remove = (id: string) => setPosts((prev) => prev.filter((p) => p.id !== id));
  const replace = (post: PostView) => setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  const pinnedIds = new Set(pinned.map((p) => p.id));

  return (
    <div className="space-y-4">
      <Composer
        me={me}
        groups={groups}
        canAnnounce={canAnnounce}
        uploadsEnabled={uploadsEnabled}
        onPosted={(post) => (post.pinned && groupId ? router.refresh() : setPosts((prev) => [post, ...prev]))}
      />

      <AnimatePresence>
        {fresh > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-16 z-20 flex justify-center lg:top-4"
          >
            <button
              type="button"
              onClick={showFresh}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary-600 px-4 text-sm font-medium text-white shadow-raised hover:bg-primary-700"
            >
              <ArrowUp className="size-4" />
              {fresh} new {fresh === 1 ? "post" : "posts"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {pinned.map((post) => (
        <PostCard key={`pin-${post.id}`} post={post} showGroup={showGroup} onRemoved={() => router.refresh()} onChange={(p) => !p.pinned && router.refresh()} />
      ))}

      <AnimatePresence initial={false}>
        {posts
          .filter((p) => !pinnedIds.has(p.id))
          .map((post) => (
            <motion.div
              key={post.id}
              layout="position"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <PostCard post={post} showGroup={showGroup} onRemoved={remove} onChange={(p) => (p.pinned && groupId ? router.refresh() : replace(p))} />
            </motion.div>
          ))}
      </AnimatePresence>

      {posts.length === 0 && pinned.length === 0 && (
        <div className="card px-8 py-14 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl border border-line bg-canvas text-ink-500">
            <MessagesSquare className="size-5" />
          </span>
          <h2 className="mt-5 font-display text-2xl text-ink-950">Start the conversation</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
            Nobody has posted yet. Introduce yourself, share what you&apos;re learning, or ask a question.
          </p>
        </div>
      )}

      <div ref={sentinel} />
      {loading && (
        <div className="flex justify-center py-6 text-ink-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!cursor && posts.length > 5 && <p className="py-6 text-center text-xs text-ink-400">You&apos;re all caught up.</p>}
    </div>
  );
}
