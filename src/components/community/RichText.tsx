import { Fragment } from "react";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/** Plain text with line breaks kept and links made clickable. Never renders HTML. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="font-medium text-primary-700 underline decoration-primary-200 underline-offset-2 hover:decoration-primary-500"
          >
            {part.replace(/^https?:\/\//, "").slice(0, 60)}
            {part.replace(/^https?:\/\//, "").length > 60 ? "…" : ""}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </div>
  );
}
