"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createCoverUpload, saveCover, type CoverTarget } from "@/app/admin/cover-actions";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "saving" } | { name: "error"; message: string };

function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and the storage bucket's CORS settings."));
    xhr.send(file);
  });
}

/** Cover image for a programme or course: drop or pick an image, uploaded straight to the bucket. */
export function CoverImageField({ target, current }: { target: CoverTarget; current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removing, startRemove] = useTransition();
  const busy = phase.name === "uploading" || phase.name === "saving" || removing;
  const shown = preview ?? current;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function upload(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) {
      setPhase({ name: "error", message: "Please choose a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase({ name: "error", message: "That image is too large (max 5 MB)." });
      return;
    }
    setPreview(URL.createObjectURL(file));
    try {
      setPhase({ name: "uploading", percent: 0 });
      const created = await createCoverUpload(target, { type: file.type, size: file.size });
      if (!created.ok) throw new Error(created.error);
      await putWithProgress(created.uploadUrl, file, created.contentType, (percent) => setPhase({ name: "uploading", percent }));

      setPhase({ name: "saving" });
      const saved = await saveCover(target, created.key);
      if (!saved.ok) throw new Error(saved.error);
      setPhase({ name: "idle" });
      router.refresh();
    } catch (err) {
      setPreview(null);
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function remove() {
    if (!window.confirm("Remove the cover image?")) return;
    startRemove(async () => {
      const res = await saveCover(target, null);
      if (!res.ok) setPhase({ name: "error", message: res.error });
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={shown ? "Replace cover image" : "Upload cover image"}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) upload(file);
        }}
        className={cn(
          "group relative grid aspect-[16/9] w-full max-w-md cursor-pointer place-items-center overflow-hidden rounded-xl border transition-colors",
          shown ? "border-line bg-ink-50" : "border-dashed border-ink-300 bg-canvas hover:border-primary-400 hover:bg-primary-50/40",
          dragging && "border-primary-500 bg-primary-50/60 ring-3 ring-primary-100",
          busy && "cursor-progress"
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob previews and redirecting /media URLs
          <img src={shown} alt="Cover image" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="px-6 text-center">
            <ImagePlus className="mx-auto size-6 text-ink-400 group-hover:text-primary-600" />
            <p className="mt-2 text-sm font-medium text-ink-800">Drop an image here, or click to choose</p>
            <p className="mt-1 text-xs text-ink-500">JPG, PNG or WebP · up to 5 MB</p>
          </div>
        )}

        {shown && !busy && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/60 py-2 text-center text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Click or drop to replace
          </span>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
            <div className="w-2/3 text-center">
              {phase.name === "uploading" ? (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                    <div className="h-full bg-primary-600 transition-[width]" style={{ width: `${phase.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-ink-700">Uploading… {phase.percent}%</p>
                </>
              ) : (
                <Loader2 className="mx-auto size-5 animate-spin text-ink-600" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {shown && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              <RefreshCw className="size-4" /> Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove} className="text-accent-700 hover:bg-accent-50">
              {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Remove
            </Button>
          </>
        )}
        {phase.name === "error" && <span className="text-sm text-accent-600">{phase.message}</span>}
      </div>
      <p className="text-xs text-ink-400">Saved as soon as it uploads. A wide image (about 1600 × 900) looks best.</p>
    </div>
  );
}
