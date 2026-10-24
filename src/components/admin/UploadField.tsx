"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { removeAsset } from "@/app/admin/lessons/[id]/actions";
import { UPLOAD_RULES, type FileBlockKind } from "@/lib/lms/blocks";
import { cn } from "@/lib/utils";
import { uploadToBlock, type UploadPhase } from "./uploadToBlock";

/** File picker and drop area for one file part, with progress and the current file. */
export function UploadField({
  blockId,
  kind,
  asset,
}: {
  blockId: string;
  kind: FileBlockKind;
  asset: { fileName: string; status: string; error: string | null; sizeBytes: number | null; scormVersion: string | null } | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UploadPhase>({ name: "idle" });
  const [over, setOver] = useState(false);
  const [removing, startRemove] = useTransition();
  const busy = phase.name === "uploading" || phase.name === "processing";
  const rule = UPLOAD_RULES[kind];

  async function upload(file: File) {
    if (asset && !window.confirm("Replace the current file?")) return;
    try {
      await uploadToBlock(blockId, kind, file, setPhase);
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
            onClick={() => window.confirm("Remove this file?") && startRemove(() => removeAsset(blockId))}
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
        accept={rule.accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      <div
        // A file dropped here replaces this part's file; it must not also create a new part.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          if (!busy) void upload(e.dataTransfer.files[0]);
        }}
        className={cn(
          "rounded-2xl border border-dashed px-4 py-5 transition-colors",
          over ? "border-primary-500 bg-primary-50" : "border-ink-200 bg-canvas/40",
          asset && "py-3"
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant={asset ? "outline" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {asset ? "Replace file" : "Choose file"}
          </Button>
          {!busy && (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
              <UploadCloud className="size-4" /> or drop it here
            </span>
          )}
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
        <p className="mt-2 text-xs text-ink-400">{rule.hint}</p>
      </div>
    </div>
  );
}
