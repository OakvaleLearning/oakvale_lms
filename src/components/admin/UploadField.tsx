"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createUpload, finalizeUpload, removeAsset } from "@/app/admin/lessons/[id]/actions";

type Kind = "VIDEO" | "AUDIO" | "SCORM" | "HTML";

const ACCEPT: Record<Kind, string> = {
  VIDEO: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
  AUDIO: "audio/*,.mp3,.m4a,.wav,.ogg,.aac",
  SCORM: ".zip,application/zip",
  HTML: ".zip,.html,.htm,application/zip,text/html",
};

const HINT: Record<Kind, string> = {
  VIDEO: "MP4 (H.264) plays everywhere. Up to 4.9 GB.",
  AUDIO: "MP3 or M4A recommended. Up to 1 GB.",
  SCORM: "The .zip exported from your authoring tool (SCORM 1.2 or 2004), with imsmanifest.xml. Up to 300 MB.",
  HTML: "A single .html file, or a .zip of a web page with index.html. Up to 300 MB.",
};

type Phase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "processing" }
  | { name: "error"; message: string };

/** Read a media file's duration in the browser so the lesson shows its length. */
function readDuration(file: File, kind: Kind): Promise<number | undefined> {
  if (kind !== "VIDEO" && kind !== "AUDIO") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const el = document.createElement(kind === "VIDEO" ? "video" : "audio");
    const url = URL.createObjectURL(file);
    const done = (v?: number) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined);
    el.onerror = () => done(undefined);
    el.src = url;
  });
}

function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and the storage bucket's CORS settings."));
    xhr.send(file);
  });
}

export function UploadField({
  lessonId,
  kind,
  asset,
}: {
  lessonId: string;
  kind: Kind;
  asset: { fileName: string; status: string; error: string | null; sizeBytes: number | null; scormVersion: string | null } | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [removing, startRemove] = useTransition();
  const busy = phase.name === "uploading" || phase.name === "processing";

  async function upload(file: File) {
    if (asset && !window.confirm("Replace the current file?")) return;
    try {
      setPhase({ name: "uploading", percent: 0 });
      const durationSec = await readDuration(file, kind);
      const created = await createUpload(lessonId, { name: file.name, type: file.type, size: file.size });
      if (!created.ok) throw new Error(created.error);

      await putWithProgress(created.uploadUrl, file, created.contentType, (percent) =>
        setPhase({ name: "uploading", percent })
      );

      setPhase({ name: "processing" });
      const finalized = await finalizeUpload(created.assetId, { durationSec });
      if (!finalized.ok) throw new Error(finalized.error);
      setPhase({ name: "idle" });
      router.refresh();
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Upload failed" });
      router.refresh();
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {asset && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-50 px-4 py-3">
          {asset.status === "READY" ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          ) : asset.status === "FAILED" ? (
            <AlertCircle className="size-5 shrink-0 text-accent-500" />
          ) : (
            <Loader2 className="size-5 shrink-0 animate-spin text-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-900">{asset.fileName}</div>
            <div className="text-xs text-ink-500">
              {asset.status === "READY" && "Ready"}
              {asset.status === "FAILED" && (asset.error ?? "Processing failed")}
              {(asset.status === "UPLOADING" || asset.status === "PROCESSING") && "Not finished. Upload again if this persists"}
              {asset.sizeBytes ? ` · ${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
              {asset.scormVersion ? ` · SCORM ${asset.scormVersion}` : ""}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || removing}
            onClick={() => window.confirm("Remove this file?") && startRemove(() => removeAsset(lessonId))}
            className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-accent-50 hover:text-accent-600 disabled:opacity-40"
            aria-label="Remove file"
          >
            {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant={asset ? "outline" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {asset ? "Replace file" : "Upload file"}
        </Button>
        {phase.name === "uploading" && (
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${phase.percent}%` }} />
            </div>
            <span className="text-xs tabular-nums text-ink-500">{phase.percent}%</span>
          </div>
        )}
        {phase.name === "processing" && (
          <span className="text-sm text-ink-500">
            {kind === "SCORM" || kind === "HTML" ? "Unpacking the package…" : "Finishing…"}
          </span>
        )}
        {phase.name === "error" && <span className="text-sm text-accent-600">{phase.message}</span>}
      </div>
      <p className="text-xs text-ink-400">{HINT[kind]}</p>
    </div>
  );
}
