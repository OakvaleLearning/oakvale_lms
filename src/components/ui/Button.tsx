import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "ghost" | "white" | "dark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-white shadow-lg shadow-primary-600/25 hover:bg-primary-700 hover:shadow-primary-600/40 hover:-translate-y-0.5",
  accent:
    "bg-accent-500 text-white shadow-lg shadow-accent-500/30 hover:bg-accent-600 hover:shadow-accent-500/45 hover:-translate-y-0.5",
  outline:
    "border border-ink-300 text-ink-800 hover:border-primary-500 hover:text-primary-700 bg-white/60",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-primary-700",
  white:
    "bg-white text-primary-700 shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:shadow-black/20",
  dark: "bg-ink-900 text-white hover:bg-ink-800 hover:-translate-y-0.5",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-4 py-2",
  md: "text-[15px] px-6 py-3",
  lg: "text-base px-8 py-4",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...props
}: CommonProps & { href: string } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
