import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "ghost" | "white" | "dark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-400 disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap";

// A faint top highlight gives filled buttons depth without a gradient.
const filled = "shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(20_18_40/0.12)]";

const variants: Record<Variant, string> = {
  primary: cn("bg-primary-600 text-white hover:bg-primary-700", filled),
  accent: cn("bg-accent-600 text-white hover:bg-accent-700", filled),
  outline:
    "border border-line bg-white text-ink-800 shadow-card hover:border-ink-300 hover:bg-ink-50",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
  white: "bg-white text-primary-800 shadow-card hover:bg-primary-50",
  dark: cn("bg-ink-900 text-white hover:bg-ink-800", filled),
};

const sizes: Record<Size, string> = {
  sm: "text-sm h-9 px-3.5",
  md: "text-sm h-10 px-5",
  lg: "text-[15px] h-12 px-6",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function buttonClass({ variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={cn(buttonClass({ variant, size }), className)} {...props}>
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
    <Link href={href} className={cn(buttonClass({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
