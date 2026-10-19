import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";

export function Logo({
  dark = false,
  scrolled = false,
  className,
}: {
  /** True when the logo sits over a dark background → use the white mark. */
  dark?: boolean;
  /** Shrinks the mark slightly once the page is scrolled. */
  scrolled?: boolean;
  className?: string;
}) {
  const src = dark ? "/oakvale-logo-white.svg" : "/oakvale-new-300x84.png";
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center", className)}
      aria-label="Oakvale Learning home"
    >
      <Image
        src={src}
        alt="Oakvale Learning"
        width={300}
        height={84}
        priority
        className={cn(
          "w-auto object-contain transition-all duration-300",
          scrolled ? "h-6 lg:h-10" : "h-9 lg:h-12"
        )}
      />
    </Link>
  );
}
