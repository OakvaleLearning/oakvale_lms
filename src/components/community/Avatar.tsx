import { cn } from "@/lib/utils";
import { initials } from "@/lib/community/shared";

const SIZES = { xs: "size-6 text-[9px]", sm: "size-8 text-[11px]", md: "size-10 text-xs", lg: "size-16 text-lg", xl: "size-24 text-2xl" };

/** A profile photo, or initials on a colour picked from the name. */
export function Avatar({
  name,
  src,
  size = "md",
  team = false,
  className,
}: {
  name: string;
  src: string | null;
  size?: keyof typeof SIZES;
  team?: boolean;
  className?: string;
}) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold tracking-wide text-white",
        SIZES[size],
        team && "ring-2 ring-primary-200 ring-offset-1",
        className
      )}
      style={src ? undefined : { backgroundColor: team ? "var(--color-primary-600)" : `hsl(${hue} 45% 45%)` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from redirecting media URLs
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Small "Team" chip next to admin names. */
export function TeamBadge() {
  return (
    <span className="inline-flex h-5 items-center rounded-full bg-primary-50 px-2 text-[11px] font-medium text-primary-700">
      Oakvale Team
    </span>
  );
}
