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
          window.prompt("Copy this verification link:", url);
        }
      }}
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />}
      {copied ? "Link copied" : "Copy verification link"}
    </Button>
  );
}
