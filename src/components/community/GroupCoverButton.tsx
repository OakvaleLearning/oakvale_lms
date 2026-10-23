"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { createGroupCoverUpload, saveGroupCover } from "@/app/community/actions";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/** Camera button on the group banner: pick a photo to set or replace it, or remove the current one. */
export function GroupCoverButton({ groupId, hasCover }: { groupId: string; hasCover: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const button =
    "inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink-900 shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-70";
  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <div className="flex gap-2">
        {hasCover && (
          <button type="button" onClick={remove} disabled={busy} className={button} aria-label="Remove banner photo" title="Remove photo">
            <Trash2 className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={button} aria-label={hasCover ? "Change banner photo" : "Add banner photo"}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          <span className="hidden sm:inline">{busy ? "Saving…" : hasCover ? "Change photo" : "Add photo"}</span>
        </button>
      </div>
      {error && <p className="max-w-56 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs text-accent-700 shadow-sm">{error}</p>}
    </div>
  );
}
