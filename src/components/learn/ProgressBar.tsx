"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/motion";

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-ink-100", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("h-full origin-left rounded-full", percent >= 100 ? "bg-emerald-500" : "bg-primary-600")}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: percent / 100 }}
        transition={{ duration: 1, ease: EASE, delay: 0.2 }}
      />
    </div>
  );
}
