"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/admin/forms";
import { createApkUpload, finishApkUpload, type ReleaseInput } from "@/app/admin/android-app/actions";

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "saving" } | { name: "done"; notified: boolean } | { name: "error"; message: string };

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

/** `npm run build:apk` names files oakvale-learning-<version>-<versionCode>.apk. */
function fromFileName(name: string): { version: string; versionCode: string } | null {
  const m = /-(\d+(?:\.\d+){0,3})-(\d+)\.apk$/i.exec(name);
  return m ? { version: m[1], versionCode: m[2] } : null;
}

const label = "mb-1.5 block text-sm font-medium text-ink-800";

/** Upload a new APK straight to the bucket, replacing the one learners download. */
export function ApkUpload({ hasCurrent, nextCode }: { hasCurrent: boolean; nextCode: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState(String(nextCode));
  const [notes, setNotes] = useState("");
  const [required, setRequired] = useState(false);
  const [notify, setNotify] = useState(true);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const busy = phase.name === "uploading" || phase.name === "saving";

  async function upload() {
    if (!file) return;
    const release: ReleaseInput = { fileName: file.name, version, versionCode: Number(versionCode), notes, required, notify };
    try {
      setPhase({ name: "uploading", percent: 0 });
      const created = await createApkUpload({ ...release, size: file.size });
      if (!created.ok) throw new Error(created.error);
      await putWithProgress(created.uploadUrl, file, created.contentType, (percent) => setPhase({ name: "uploading", percent }));
      setPhase({ name: "saving" });
      const done = await finishApkUpload(release);
      if (!done.ok) throw new Error(done.error);
      setPhase({ name: "done", notified: done.notified });
      setFile(null);
      setNotes("");
      setRequired(false);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={label}>APK file</span>
        <input
          ref={input}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            const parsed = f && fromFileName(f.name);
            if (parsed) {
              setVersion(parsed.version);
              setVersionCode(parsed.versionCode);
            }
            setPhase({ name: "idle" });
          }}
          className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-800 hover:file:bg-primary-100"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Version</span>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.0.1" disabled={busy} />
        </label>
        <label className="block">
          <span className={label}>Version code</span>
          <Input type="number" min={1} step={1} value={versionCode} onChange={(e) => setVersionCode(e.target.value)} disabled={busy} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-ink-500">Filled in from the file name when it comes from <code>npm run build:apk</code>. The version code must go up with every release.</p>

      <label className="block">
        <span className={label}>What&apos;s new (optional)</span>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Shown in the update message" disabled={busy} />
      </label>

      <div className="space-y-2 text-sm text-ink-800">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} />
          <span>Send app users a notification about this update</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={required} onChange={(e) => setRequired(e.target.checked)} disabled={busy} />
          <span>
            Required update <span className="text-ink-500">(older versions can&apos;t be used until they update; use for breaking changes only)</span>
          </span>
        </label>
      </div>

      {phase.name === "uploading" && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
            <div className="h-full bg-primary-600 transition-[width]" style={{ width: `${phase.percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-ink-600">Uploading… {phase.percent}%. Keep this page open.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={upload} disabled={!file || !version || !versionCode || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {hasCurrent ? "Release update" : "Upload"}
        </Button>
        {phase.name === "done" && (
          <span className="text-sm text-primary-700">Released.{phase.notified ? " App users are being notified." : ""}</span>
        )}
        {phase.name === "error" && <span className="text-sm text-accent-600">{phase.message}</span>}
      </div>
    </div>
  );
}
