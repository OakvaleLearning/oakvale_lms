"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { saveAvatar } from "@/app/community/actions";
import { Avatar } from "./Avatar";
import { IMAGE_ACCEPT, uploadCommunityImage } from "./uploads";

/** Profile photo: pick an image, it uploads straight to the bucket and replaces the old one. */
export function AvatarField({ name, current, enabled }: { name: string; current: string | null; enabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function upload(file: File) {
    setError("");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const key = await uploadCommunityImage({ purpose: "avatar" }, file);
      const saved = await saveAvatar(key);
      if (!saved.ok) throw new Error(saved.error);
      router.refresh();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        <Avatar name={name} src={preview ?? current} size="xl" />
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink-950/40 text-white">
            <Loader2 className="size-6 animate-spin" />
          </span>
        )}
      </div>
      <div className="space-y-2">
        <input ref={input} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={!enabled || busy}>
            <Camera className="size-4" /> {current ? "Change photo" : "Upload photo"}
          </Button>
          {current && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing || busy}
              onClick={() =>
                startRemove(async () => {
                  const res = await saveAvatar(null);
                  if (!res.ok) setError(res.error);
                  setPreview(null);
                  router.refresh();
                })
              }
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-500">{enabled ? "JPG, PNG or WebP · up to 5 MB" : "Photo uploads aren't available yet."}</p>
        {error && <p className="text-sm text-accent-700">{error}</p>}
      </div>
    </div>
  );
}
