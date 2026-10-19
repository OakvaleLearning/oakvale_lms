import { FileCode2, Headphones, ListChecks, Package, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  VIDEO: PlayCircle,
  AUDIO: Headphones,
  QUIZ: ListChecks,
  SCORM: Package,
  HTML: FileCode2,
} as const;

export const LESSON_TYPE_LABEL = {
  VIDEO: "Video",
  AUDIO: "Audio",
  QUIZ: "Quiz",
  SCORM: "Interactive (SCORM)",
  HTML: "Interactive (HTML)",
} as const;

export function LessonIcon({ type, className }: { type: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={cn("size-4", className)} />;
}
