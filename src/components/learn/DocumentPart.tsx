import { Download, ExternalLink, FileText } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { LessonFrame } from "@/components/learn/LessonFrame";

const size = (bytes: number | null) =>
  bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`) : null;

/**
 * A document part, shown in the lesson. PDFs and images display directly;
 * Word, PowerPoint and Excel files display in Microsoft's viewer. Download and
 * open-in-new-tab buttons appear only when the lesson creator allows downloads
 * (`downloadUrl` is null otherwise).
 */
export function DocumentPart({
  display,
  fileName,
  sizeBytes,
  url,
  downloadUrl,
  viewerUrl,
  title,
}: {
  display: "pdf" | "image" | "download";
  fileName: string;
  sizeBytes: number | null;
  /** Where to show it (inline). */
  url: string;
  /** Where to save it (forces a download); null when downloads are off. */
  downloadUrl: string | null;
  /** In-app viewer for Office files; null for other files. */
  viewerUrl: string | null;
  title: string;
}) {
  const canSave = downloadUrl !== null;

  const actions = (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
      <span className="min-w-0 flex-1 truncate">{fileName}</span>
      {canSave && (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
            <ExternalLink className="size-4" /> Open in new tab
          </a>
          <a href={downloadUrl} className={buttonClass({ variant: "outline", size: "sm" })}>
            <Download className="size-4" /> Download
          </a>
        </>
      )}
    </div>
  );

  if (display === "pdf") {
    // The fragment hides the browser PDF viewer's toolbar (with its save and print buttons) when downloads are off.
    const src = canSave ? url : `${url}#toolbar=0&navpanes=0`;
    return (
      <div>
        <LessonFrame title={title}>
          <iframe src={src} title={title} className="absolute inset-0 size-full" />
        </LessonFrame>
        {actions}
      </div>
    );
  }

  if (display === "image") {
    return (
      <figure className="card overflow-hidden">
        {/* A signed storage URL that expires; next/image would only cache it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={title}
          draggable={canSave}
          className="mx-auto max-h-[80vh] w-auto max-w-full"
          {...(canSave ? {} : { style: { WebkitTouchCallout: "none", userSelect: "none" } })}
        />
      </figure>
    );
  }

  if (viewerUrl) {
    return (
      <div>
        <LessonFrame title={title}>
          <iframe src={viewerUrl} title={title} className="absolute inset-0 size-full" />
        </LessonFrame>
        {actions}
      </div>
    );
  }

  // A file nothing can show in the page: offer the download if allowed.
  return (
    <div className="card flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
        <FileText className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-950">{fileName}</div>
        <div className="mt-0.5 text-xs text-ink-500">
          {canSave ? `${size(sizeBytes) ?? "Document"}. Opens in your usual app.` : "This file can't be shown in the lesson."}
        </div>
      </div>
      {canSave && (
        <a href={downloadUrl} className={buttonClass({ variant: "primary", size: "sm" })}>
          <Download className="size-4" /> Download
        </a>
      )}
    </div>
  );
}
