import { timeAgo } from "@/lib/community/shared";

/** Relative time; the server and browser may disagree by a minute, so hydration warnings are silenced. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-GB")} className={className} suppressHydrationWarning>
      {timeAgo(iso)}
    </time>
  );
}
