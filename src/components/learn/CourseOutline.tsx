import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import type { OutlineLesson } from "@/lib/lms/catalog";
import { ProgressBar } from "@/components/learn/ProgressBar";
import { cn } from "@/lib/utils";

type OutlineModule = { id: string; title: string; lessons: OutlineLesson[] };

export function formatDuration(sec: number | null) {
  if (!sec) return null;
  const min = Math.max(1, Math.round(sec / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim() : `${min} min`;
}

export function LessonStatusIcon({ lesson, className }: { lesson: OutlineLesson; className?: string }) {
  if (lesson.locked) return <Lock className={cn("size-4 shrink-0 text-ink-300", className)} />;
  if (lesson.status === "COMPLETED") return <CheckCircle2 className={cn("size-4 shrink-0 text-emerald-600", className)} />;
  if (lesson.status === "IN_PROGRESS") return <CircleDot className={cn("size-4 shrink-0 text-primary-600", className)} />;
  return <Circle className={cn("size-4 shrink-0 text-ink-300", className)} />;
}

/** Compact list of every lesson in the course, shown beside the lesson being studied. */
export function CourseOutline({
  modules,
  base,
  currentId,
  progress,
}: {
  modules: OutlineModule[];
  base: string;
  currentId: string;
  progress: { completed: number; total: number; percent: number };
}) {
  return (
    <aside className="card overflow-hidden">
      <div className="border-b border-line p-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-ink-950">Course contents</span>
          <span className="tabular-nums text-ink-500">
            {progress.completed}/{progress.total} done
          </span>
        </div>
        <ProgressBar percent={progress.percent} className="mt-3" />
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-2 lg:max-h-[calc(100vh-14rem)]">
        {modules.map((m, mi) => (
          <section key={m.id} className="py-2">
            <h3 className="truncate px-5 pb-1.5 text-xs font-medium text-ink-500">
              {mi + 1}. {m.title}
            </h3>
            <ol>
              {m.lessons.map((l) => {
                const current = l.id === currentId;
                const row = (
                  <>
                    <LessonStatusIcon lesson={l} />
                    <span className={cn("min-w-0 flex-1 truncate", current ? "font-medium text-ink-950" : "text-ink-700")}>
                      {l.title}
                    </span>
                  </>
                );
                return (
                  <li key={l.id}>
                    {l.locked ? (
                      <div
                        className="flex items-center gap-2.5 px-5 py-2 text-sm opacity-60"
                        title="Complete the earlier lessons to unlock"
                      >
                        {row}
                      </div>
                    ) : (
                      <Link
                        href={`${base}/${l.id}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 px-5 py-2 text-sm transition-colors",
                          current ? "bg-primary-50/70" : "hover:bg-canvas"
                        )}
                      >
                        {current && <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-primary-600" />}
                        {row}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}
