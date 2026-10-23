import { createUpload, finalizeUpload } from "@/app/admin/lessons/[id]/actions";
import type { FileBlockKind } from "@/lib/lms/blocks";

export type UploadPhase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "processing" }
  | { name: "error"; message: string };

/** Read a media file's duration in the browser so the lesson shows its length. */
function readDuration(file: File, kind: FileBlockKind): Promise<number | undefined> {
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

/**
 * Put a file in a lesson part: register it, send it straight to storage, then
 * let the server finish (read the length, unpack a package). Throws with a
 * message fit to show the admin. `detect` lets a .zip dropped on a web page
 * part turn out to be a SCORM package.
 */
export async function uploadToBlock(
  blockId: string,
  kind: FileBlockKind,
  file: File,
  onPhase: (phase: UploadPhase) => void,
  opts: { detect?: boolean } = {}
): Promise<void> {
  onPhase({ name: "uploading", percent: 0 });
  const durationSec = await readDuration(file, kind);
  const created = await createUpload(blockId, { name: file.name, type: file.type, size: file.size });
  if (!created.ok) throw new Error(created.error);

  await putWithProgress(created.uploadUrl, file, created.contentType, (percent) => onPhase({ name: "uploading", percent }));

  onPhase({ name: "processing" });
  const finalized = await finalizeUpload(created.assetId, { durationSec, detect: opts.detect });
  if (!finalized.ok) throw new Error(finalized.error);
  onPhase({ name: "idle" });
}
