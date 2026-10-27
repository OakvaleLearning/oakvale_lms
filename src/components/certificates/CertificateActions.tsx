"use client";

import { useState } from "react";
import { Check, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Opens the print dialog; the certificate page prints as one A4 landscape sheet ("Save as PDF"). */
export function DownloadButton({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Button type="button" size={size} onClick={() => window.print()}>
      <Download className="size-4" /> Download PDF
    </Button>
  );
}

export function CopyLinkButton({ url, size = "md" }: { url: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  // Shown when the browser won't let us copy (e.g. no clipboard access), so the link can be copied by hand.
  const [manual, setManual] = useState(false);

  if (manual) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Verification link"
          autoFocus
          onFocus={(e) => e.target.select()}
          className="h-9 w-72 max-w-full rounded-lg border border-line bg-white px-3 text-sm text-ink-900 outline-none focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setManual(false)}>
          Done
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setManual(true);
        }
      }}
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />}
      {copied ? "Link copied" : "Copy verification link"}
    </Button>
  );
}
