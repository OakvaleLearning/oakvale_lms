"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { createGroupCoverUpload, saveGroupCover } from "@/app/community/actions";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/** Camera button on the group banner: pick a photo to set or replace it, or remove the current one. */
export function GroupCoverButton({ groupId, hasCover }: { groupId: string; hasCover: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function upload(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) return setError("Please choose a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return setError("That image is too large (max 5 MB).");
    void run(async () => {
      const created = await createGroupCoverUpload(groupId, { type: file.type, size: file.size });
      if (!created.ok) throw new Error(created.error);
      const put = await fetch(created.uploadUrl, { method: "PUT", headers: { "Content-Type": created.contentType }, body: file });
      if (!put.ok) throw new Error("Upload failed. Please try again.");
      const saved = await saveGroupCover(groupId, created.key);
      if (!saved.ok) throw new Error(saved.error);
    });
  }

  function remove() {
    if (!window.confirm("Remove the banner photo?")) return;
    void run(async () => {
      const res = await saveGroupCover(groupId, null);
      if (!res.ok) throw new Error(res.error);
    });
  }

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50 disabled:opacity-60";
  return (
    <div ref={wrap} className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Banner photo options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Banner photo options"
        className="grid size-8 place-items-center rounded-full bg-white/90 text-ink-900 shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
      </button>
      {open && (
        <div role="menu" className="w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-raised">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              input.current?.click();
            }}
          >
            <Camera className="size-4 text-ink-500" /> {hasCover ? "Change photo" : "Add photo"}
          </button>
          {hasCover && (
            <button
              type="button"
              role="menuitem"
              className={item + " text-accent-700"}
              onClick={() => {
                setOpen(false);
                remove();
              }}
            >
              <Trash2 className="size-4" /> Remove photo
            </button>
          )}
        </div>
      )}
      {error && <p className="max-w-56 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs text-accent-700 shadow-sm">{error}</p>}
    </div>
  );
}
