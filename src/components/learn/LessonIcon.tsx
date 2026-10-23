import { AlignLeft, FileCode2, FileText, Headphones, Layers, ListChecks, Package, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  VIDEO: PlayCircle,
  AUDIO: Headphones,
  QUIZ: ListChecks,
  SCORM: Package,
  HTML: FileCode2,
  DOCUMENT: FileText,
  TEXT: AlignLeft,
  MIXED: Layers,
} as const;

/** What a lesson (or one of its parts) is called. A lesson of several parts is "Multi-part". */
export const LESSON_TYPE_LABEL = {
  VIDEO: "Video",
  AUDIO: "Audio",
  QUIZ: "Quiz",
  SCORM: "Interactive (SCORM)",
  HTML: "Interactive (HTML)",
  DOCUMENT: "Document",
  TEXT: "Reading",
  MIXED: "Multi-part",
} as const;

export function LessonIcon({ type, className }: { type: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={cn("size-4", className)} />;
}
