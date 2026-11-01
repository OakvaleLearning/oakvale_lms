"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { updateBlock } from "@/app/admin/lessons/[id]/actions";
import { Input } from "@/components/admin/forms";
import { EmbedFrame } from "@/components/learn/EmbedFrame";
import { Button } from "@/components/ui/Button";

/**
 * Set the page an EMBED part shows: paste a Genially share link (or its embed
 * code, or any other https link). Shows a preview of what learners will see.
 */
export function EmbedPartEditor({ blockId, initial }: { blockId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await updateBlock(blockId, { embedUrl: value });
      if (!res.ok) return setError(res.error);
      const url = res.embedUrl ?? "";
      setSaved(url);
      setValue(url);
    });
  }

  const dirty = value.trim() !== saved;

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="rounded-xl border border-line bg-white p-4">
        <label htmlFor={`embed-${blockId}`} className="block text-sm font-medium text-ink-900">
          Link or embed code
        </label>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          In Genially, open your creation and choose <strong>Share</strong>, then copy the <strong>Link</strong>{" "}
          (view.genially.com/…) or the <strong>Embed</strong> code. Set its visibility to public or unlisted so learners
          can see it without a Genially account. Other https pages that allow embedding work too.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            id={`embed-${blockId}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://view.genially.com/…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
          <Button type="submit" size="md" disabled={pending || !dirty} className="shrink-0">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save link
          </Button>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-accent-600">{error}</p>
        ) : (
          saved &&
          !dirty && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Saved.{" "}
              <a href={saved} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-700 hover:underline">
                Open in a new tab <ExternalLink className="size-3" />
              </a>
            </p>
          )
        )}
      </form>

      {saved ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">Preview</p>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-white sm:aspect-video">
            <EmbedFrame key={saved} src={saved} title="Embed preview" className="absolute inset-0 size-full" />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Blank or showing an error? The site may not allow embedding, or the page isn&apos;t public.
          </p>
        </div>
      ) : null}
    </div>
  );
}
