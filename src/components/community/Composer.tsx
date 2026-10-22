"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Loader2, Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/TextField";
import { EASE } from "@/components/motion";
import { createPost } from "@/app/community/actions";
import { POST_MAX_CHARS, POST_MAX_IMAGES } from "@/lib/validation";
import type { AuthorView, PostView } from "@/lib/community/shared";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { IMAGE_ACCEPT, uploadCommunityImage } from "./uploads";

interface Attachment {
  id: number;
  preview: string;
  key?: string;
  percent: number;
  error?: string;
}

/** "Share something…" box at the top of a feed; expands into the full composer. */
export function Composer({
  me,
  groups,
  canAnnounce,
  uploadsEnabled,
  onPosted,
}: {
  me: AuthorView;
  /** Groups the post can go to; the first is the default. */
  groups: { id: string; name: string }[];
  canAnnounce: boolean;
  uploadsEnabled: boolean;
  onPosted: (post: PostView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [announcement, setAnnouncement] = useState(false);
  const [images, setImages] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const uploading = images.some((i) => !i.key && !i.error);
  const remaining = POST_MAX_CHARS - body.length;

  useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }, [body, open]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = POST_MAX_IMAGES - images.length;
    for (const file of [...files].slice(0, room)) {
      const id = ++nextId.current;
      setImages((prev) => [...prev, { id, preview: URL.createObjectURL(file), percent: 0 }]);
      const update = (patch: Partial<Attachment>) => setImages((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      uploadCommunityImage({ purpose: "post", groupId }, file, (percent) => update({ percent }))
        .then((key) => update({ key, percent: 100 }))
        .catch((err) => update({ error: err instanceof Error ? err.message : "Upload failed" }));
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeImage(id: number) {
    setImages((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function reset() {
    images.forEach((i) => URL.revokeObjectURL(i.preview));
    setImages([]);
    setBody("");
    setAnnouncement(false);
    setError("");
    setOpen(false);
  }

  async function submit() {
    if (!body.trim() || uploading || posting) return;
    setPosting(true);
    setError("");
    const res = await createPost({
      groupId,
      body,
      images: images.flatMap((i) => (i.key ? [i.key] : [])),
      announcement,
    }).catch(() => ({ ok: false as const, error: "Your post couldn't be shared. Check your connection and try again." }));
    setPosting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onPosted(res.post);
    reset();
  }

  // Images are stored per group, so switching group after attaching would orphan them.
  const groupLocked = images.length > 0;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex gap-3">
        <Avatar name={me.name} src={me.avatar} team={me.team} size="md" />
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-10 flex-1 rounded-full border border-line bg-canvas px-4 text-left text-sm text-ink-500 transition-colors hover:border-ink-300 hover:bg-white"
          >
            Share something with the community…
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <textarea
              ref={textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
              rows={3}
              maxLength={POST_MAX_CHARS}
              placeholder="Ask a question, share a win, or start a discussion…"
              aria-label="Write a post"
              className="block w-full resize-none bg-transparent py-2 text-[15px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            {images.length > 0 && (
              <ul className="mt-3 grid grid-cols-4 gap-2 sm:ml-13">
                {images.map((img) => (
                  <li key={img.id} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-ink-50">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img src={img.preview} alt="" className={cn("size-full object-cover", !img.key && "opacity-60")} />
                    {!img.key && !img.error && (
                      <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/60">
                        <span className="block h-full bg-primary-600 transition-[width]" style={{ width: `${img.percent}%` }} />
                      </span>
                    )}
                    {img.error && (
                      <span className="absolute inset-0 grid place-items-center bg-accent-900/70 p-1 text-center text-[11px] leading-tight text-white">
                        {img.error}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      aria-label="Remove image"
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-ink-950/60 text-white hover:bg-ink-950/80"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="mt-3 sm:ml-13">
                <FormError>{error}</FormError>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {uploadsEnabled && (
                <>
                  <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={images.length >= POST_MAX_IMAGES}
                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
                  >
                    <ImagePlus className="size-4" /> Photo
                  </button>
                </>
              )}
              {canAnnounce && (
                <label
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                    announcement ? "bg-amber-50 text-amber-800" : "text-ink-600 hover:bg-ink-100"
                  )}
                  title="Pins the post and notifies every member"
                >
                  <input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} className="sr-only" />
                  <Megaphone className="size-4" /> Announcement
                </label>
              )}
              {groups.length > 1 && (
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  disabled={groupLocked}
                  aria-label="Post to group"
                  title={groupLocked ? "Remove the photos to change group" : undefined}
                  className="h-9 max-w-52 truncate rounded-lg border border-line bg-white px-2.5 text-sm text-ink-800 outline-none focus:border-primary-500 disabled:opacity-60"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="ml-auto flex items-center gap-2">
                {remaining < 300 && <span className={cn("text-xs tabular-nums", remaining < 50 ? "text-accent-700" : "text-ink-400")}>{remaining}</span>}
                <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={posting}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={submit} disabled={!body.trim() || uploading || posting}>
                  {posting ? <Loader2 className="size-4 animate-spin" /> : uploading ? "Uploading…" : "Post"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
