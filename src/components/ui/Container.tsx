import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({
  children,
  className,
  as: Tag = "div",
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  size?: "default" | "narrow" | "wide";
}) {
  const width =
    size === "narrow"
      ? "max-w-3xl"
      : size === "wide"
        ? "max-w-7xl"
        : "max-w-6xl";
  return (
    <Tag className={cn("mx-auto w-full px-5 sm:px-8", width, className)}>
      {children}
    </Tag>
  );
}
