"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, GripVertical, Loader2, Plus, UploadCloud, X } from "lucide-react";
import { addBlock, deleteBlock, reorderBlocks, updateBlock } from "@/app/admin/lessons/[id]/actions";
import { LessonIcon } from "@/components/learn/LessonIcon";
import { DeleteButton } from "@/components/admin/forms";
import { StatusBadge } from "@/components/dashboard/ui";
import { uploadToBlock, type UploadPhase } from "@/components/admin/uploadToBlock";
import {
  BLOCK_HINT,
  BLOCK_LABEL,
  BLOCK_TYPES,
  blockTypeForFile,
  ONE_PER_LESSON,
  type BlockKind,
} from "@/lib/lms/blocks";
import type { PartStatus } from "@/lib/lms/readiness";
import { cn } from "@/lib/utils";

/** What the server page hands over for each part; `editor` is rendered on the server. */
export interface BuilderPart {
  id: string;
  type: BlockKind;
  title: string;
  required: boolean;
  /** Estimated minutes. For video and audio this is read from the file. */
  durationMin: number | null;
  status: PartStatus;
  /** One line shown while the part is collapsed. */
  summary: string;
  editor: ReactNode;
}

interface QueueItem {
  id: string;
  name: string;
  phase: UploadPhase;
}

const DELETE_WARNING: Record<BlockKind, string> = {
  VIDEO: "Delete this video part and its file?",
  AUDIO: "Delete this audio part and its file?",
  SCORM: "Delete this SCORM part and its file? Learners' progress in it will be lost.",
  HTML: "Delete this web page part and its file?",
  DOCUMENT: "Delete this document part and its file?",
  TEXT: "Delete this text part?",
  QUIZ: "Delete the quiz, all of its questions and learners' attempts? This cannot be undone.",
};

/**
 * Build a lesson from parts. Add parts anywhere in the flow, drag to reorder,
 * or drop files straight onto the page to create parts from them.
 */
export function LessonBuilder({ lessonId, parts, locked }: { lessonId: string; parts: BuilderPart[]; locked: boolean }) {
  const router = useRouter();
  const [list, setOrder] = useOptimistic(parts, (state, ids: string[]) =>
    ids.map((id) => state.find((p) => p.id === id)).filter((p): p is BuilderPart => Boolean(p))
  );
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(parts.length === 1 ? [parts[0].id] : parts.filter((p) => p.status !== "READY").slice(0, 1).map((p) => p.id))
  );
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [, startReorder] = useTransition();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [fileDrag, setFileDrag] = useState(false);
  const dragDepth = useRef(0);
  const justAdded = useRef<string | null>(null);

  // Drag-to-reorder state.
  const [armed, setArmed] = useState<string | null>(null); // part whose handle is held
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);

  const has = (type: BlockKind) => list.some((p) => p.type === type);

  // Bring a freshly added part into view once the server has sent it back.
  useEffect(() => {
    const id = justAdded.current;
    if (!id || !parts.some((p) => p.id === id)) return;
    justAdded.current = null;
    document.getElementById(`part-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [parts]);

  async function add(type: BlockKind, position?: number) {
    setError("");
    setAdding(true);
    const res = await addBlock(lessonId, type, position);
    setAdding(false);
    if (!res.ok) return setError(res.error);
    justAdded.current = res.blockId;
    setOpen((prev) => new Set(prev).add(res.blockId));
  }

  function commitOrder(ids: string[]) {
    setError("");
    startReorder(async () => {
      setOrder(ids);
      const res = await reorderBlocks(lessonId, ids);
      if (!res.ok) setError(res.error);
    });
  }

  function move(id: string, by: -1 | 1) {
    const ids = list.map((p) => p.id);
    const from = ids.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    commitOrder(ids);
  }

  function drop() {
    if (dragId && target && dragId !== target.id) {
      const ids = list.map((p) => p.id).filter((id) => id !== dragId);
      const at = ids.indexOf(target.id) + (target.after ? 1 : 0);
      ids.splice(at, 0, dragId);
      commitOrder(ids);
    }
    setDragId(null);
    setArmed(null);
    setTarget(null);
  }

  /** Files dropped on the page become new parts, each of the kind its name suggests. */
  async function addFiles(files: File[]) {
    setError("");
    for (const file of files) {
      const item: QueueItem = { id: crypto.randomUUID(), name: file.name, phase: { name: "uploading", percent: 0 } };
      const patch = (phase: UploadPhase) => setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, phase } : x)));
      setQueue((q) => [...q, item]);

      const guess = blockTypeForFile(file.name);
      if (!guess) {
        patch({ name: "error", message: "This kind of file can't be used in a lesson." });
        continue;
      }
      // A .zip is a web page unless it turns out to hold a SCORM manifest.
      const kind = guess === "ZIP" ? "HTML" : guess;
      const created = await addBlock(lessonId, kind);
      if (!created.ok) {
        patch({ name: "error", message: created.error });
        continue;
      }
      setOpen((prev) => new Set(prev).add(created.blockId));
      try {
        await uploadToBlock(created.blockId, kind, file, patch, { detect: guess === "ZIP" });
        setQueue((q) => q.filter((x) => x.id !== item.id));
      } catch (err) {
        patch({ name: "error", message: err instanceof Error ? err.message : "Upload failed" });
      }
    }
    router.refresh();
  }

  const filesOver = (e: React.DragEvent) => !locked && !dragId && e.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative space-y-3"
      onDragEnter={(e) => {
        if (!filesOver(e)) return;
        dragDepth.current += 1;
        setFileDrag(true);
      }}
      onDragOver={(e) => filesOver(e) && e.preventDefault()}
      onDragLeave={(e) => {
        if (!filesOver(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setFileDrag(false);
      }}
      onDrop={(e) => {
        if (!filesOver(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setFileDrag(false);
        void addFiles([...e.dataTransfer.files]);
      }}
    >
      {locked && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This is a final assessment, so it holds just its quiz. To combine a quiz with other material, add the quiz to a regular lesson.
        </p>
      )}

      {queue.length > 0 && <UploadQueue items={queue} onDismiss={(id) => setQueue((q) => q.filter((x) => x.id !== id))} />}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      {list.length === 0 ? (
        <section className="card p-6 text-center sm:p-10">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-700">
            <UploadCloud className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink-950">Build this lesson from parts</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Learners work through the parts in order: for example a video, then a handout, then a short quiz. Drop files
            anywhere on this page, or pick a kind of part to start.
          </p>
          <div className="mt-6 text-left">
            <Palette variant="tiles" has={has} disabled={adding || locked} onPick={(t) => add(t)} />
          </div>
        </section>
      ) : (
        <ol>
          {list.map((part, i) => (
            <li key={part.id}>
              <InsertSlot index={i} has={has} disabled={adding || locked} onPick={(t) => add(t, i)} />
              <PartCard
                part={part}
                index={i}
                count={list.length}
                expanded={open.has(part.id)}
                onToggle={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(part.id)) next.add(part.id);
                    return next;
                  })
                }
                onMove={(by) => move(part.id, by)}
                drag={{
                  armed: armed === part.id,
                  dragging: dragId === part.id,
                  line: target?.id === part.id ? (target.after ? "after" : "before") : null,
                  arm: () => setArmed(part.id),
                  disarm: () => setArmed(null),
                  start: () => setDragId(part.id),
                  end: () => {
                    setDragId(null);
                    setArmed(null);
                    setTarget(null);
                  },
                  over: (after) => dragId && dragId !== part.id && setTarget({ id: part.id, after }),
                  drop,
                }}
              />
            </li>
          ))}
        </ol>
      )}

      {list.length > 0 && !locked && (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-800">
            {adding ? <Loader2 className="size-4 animate-spin text-ink-400" /> : <Plus className="size-4 text-ink-400" />}
            Add a part
            <span className="hidden text-xs font-normal text-ink-500 sm:inline">or drop files anywhere on this page</span>
          </div>
          <Palette variant="chips" has={has} disabled={adding} onPick={(t) => add(t)} />
        </div>
      )}

      {fileDrag && (
        <div className="pointer-events-none absolute -inset-2 z-20 grid place-items-center rounded-3xl border-2 border-dashed border-primary-500 bg-primary-50/90">
          <div className="text-center">
            <UploadCloud className="mx-auto size-8 text-primary-600" />
            <p className="mt-2 text-sm font-semibold text-primary-900">Drop to add as new parts</p>
            <p className="mt-0.5 text-xs text-primary-700">Videos, audio, PDFs, Office files, web pages and packages</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Adding parts
 * ------------------------------------------------------------------ */

function Palette({
  variant,
  has,
  disabled,
  onPick,
}: {
  variant: "tiles" | "chips";
  has: (t: BlockKind) => boolean;
  disabled: boolean;
  onPick: (t: BlockKind) => void;
}) {
  return (
    <div className={variant === "tiles" ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
      {BLOCK_TYPES.map((type) => {
        const taken = ONE_PER_LESSON.includes(type) && has(type);
        return (
          <button
            key={type}
            type="button"
            disabled={disabled || taken}
            onClick={() => onPick(type)}
            title={taken ? `A lesson can have one ${BLOCK_LABEL[type].toLowerCase()} part` : BLOCK_HINT[type]}
            className={cn(
              "group flex items-center gap-3 rounded-xl border border-line bg-white text-left transition-colors hover:border-primary-400 hover:bg-primary-50/50 focus-visible:ring-3 focus-visible:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-white",
              variant === "tiles" ? "p-3" : "h-9 px-3 text-sm font-medium text-ink-800"
            )}
          >
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 group-hover:bg-primary-600 group-hover:text-white",
                variant === "tiles" ? "size-9" : "size-5 bg-transparent"
              )}
            >
              <LessonIcon type={type} className={variant === "tiles" ? "size-4" : "size-4"} />
            </span>
            {variant === "tiles" ? (
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900">{BLOCK_LABEL[type]}</span>
                <span className="block text-xs leading-relaxed text-ink-500">{taken ? "Already in this lesson" : BLOCK_HINT[type]}</span>
              </span>
            ) : (
              BLOCK_LABEL[type]
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A hairline between two parts that opens the palette to insert one right there. */
function InsertSlot({
  index,
  has,
  disabled,
  onPick,
}: {
  index: number;
  has: (t: BlockKind) => boolean;
  disabled: boolean;
  onPick: (t: BlockKind) => void;
}) {
  const [open, setOpen] = useState(false);
  if (disabled && !open) return <div className="h-3" />;
  return (
    <div className="group/slot relative">
      <div className="flex h-3 items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={index === 0 ? "Add a part at the start" : "Add a part here"}
          className={cn(
            "absolute left-1/2 z-10 grid h-5 -translate-x-1/2 place-items-center rounded-full border border-line bg-white px-2 text-ink-500 shadow-card transition-opacity hover:border-primary-400 hover:text-primary-700 focus-visible:opacity-100",
            open ? "opacity-100" : "opacity-0 group-hover/slot:opacity-100 [@media(hover:none)]:opacity-60"
          )}
        >
          {open ? <X className="size-3" /> : <Plus className="size-3" />}
        </button>
        <div className={cn("h-px w-full bg-primary-300 transition-opacity", open ? "opacity-100" : "opacity-0 group-hover/slot:opacity-100")} />
      </div>
      {open && (
        <div className="my-2 rounded-2xl border border-line bg-white p-3 shadow-card">
          <Palette
            variant="chips"
            has={has}
            disabled={disabled}
            onPick={(t) => {
              setOpen(false);
              onPick(t);
            }}
          />
        </div>
      )}
    </div>
  );
}

function UploadQueue({ items, onDismiss }: { items: QueueItem[]; onDismiss: (id: string) => void }) {
  return (
    <ul className="space-y-2 rounded-2xl border border-line bg-white p-3 shadow-card" aria-live="polite">
      {items.map(({ id, name, phase }) => (
        <li key={id} className="flex items-center gap-3 text-sm">
          {phase.name === "error" ? (
            <AlertCircle className="size-4 shrink-0 text-accent-500" />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary-600" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink-900">{name}</span>
            {phase.name === "error" ? (
              <span className="block text-xs text-accent-600">{phase.message}</span>
            ) : (
              <span className="mt-1 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <span
                    className="block h-full bg-primary-600 transition-all"
                    style={{ width: `${phase.name === "uploading" ? phase.percent : 100}%` }}
                  />
                </span>
                <span className="text-xs tabular-nums text-ink-500">
                  {phase.name === "uploading" ? `${phase.percent}%` : "Processing…"}
                </span>
              </span>
            )}
          </span>
          {phase.name === "error" && (
            <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss" className="grid size-7 place-items-center rounded-lg text-ink-400 hover:bg-ink-100">
              <X className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * One part
 * ------------------------------------------------------------------ */

interface DragApi {
  armed: boolean;
  dragging: boolean;
  line: "before" | "after" | null;
  arm: () => void;
  disarm: () => void;
  start: () => void;
  end: () => void;
  over: (after: boolean) => void;
  drop: () => void;
}

function PartCard({
  part,
  index,
  count,
  expanded,
  onToggle,
  onMove,
  drag,
}: {
  part: BuilderPart;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  drag: DragApi;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(part.title);
  const [minutes, setMinutes] = useState(part.durationMin ? String(part.durationMin) : "");
  const [required, setRequired] = useState(part.required);
  const mediaLength = part.type === "VIDEO" || part.type === "AUDIO";

  // Take the server's word again after it changes (e.g. the length read from a new video).
  const [seen, setSeen] = useState({ title: part.title, durationMin: part.durationMin, required: part.required });
  if (seen.title !== part.title || seen.durationMin !== part.durationMin || seen.required !== part.required) {
    setSeen({ title: part.title, durationMin: part.durationMin, required: part.required });
    setTitle(part.title);
    setMinutes(part.durationMin ? String(part.durationMin) : "");
    setRequired(part.required);
  }

  function save(input: Parameters<typeof updateBlock>[1]) {
    setError("");
    start(async () => {
      const res = await updateBlock(part.id, input);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <article
      id={`part-${part.id}`}
      draggable={drag.armed}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", part.id);
        e.dataTransfer.effectAllowed = "move";
        drag.start();
      }}
      onDragEnd={drag.end}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/plain") || e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        drag.over(e.clientY > box.top + box.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.drop();
      }}
      className={cn("card relative scroll-mt-24 transition-opacity", drag.dragging && "opacity-40")}
    >
      {drag.line && (
        <span
          aria-hidden
          className={cn("absolute inset-x-3 z-10 h-0.5 rounded-full bg-primary-500", drag.line === "before" ? "-top-1.5" : "-bottom-1.5")}
        />
      )}

      <div className="flex items-center gap-1.5 py-2.5 pl-1.5 pr-2 sm:gap-2 sm:pr-3">
        <button
          type="button"
          onMouseDown={drag.arm}
          onMouseUp={drag.disarm}
          onTouchStart={drag.arm}
          className="hidden size-8 shrink-0 cursor-grab place-items-center rounded-lg text-ink-300 hover:bg-ink-100 hover:text-ink-600 active:cursor-grabbing sm:grid"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical className="size-4" />
        </button>

        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700">
          <LessonIcon type={part.type} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500">
            <span className="font-medium text-ink-700">
              {index + 1}. {BLOCK_LABEL[part.type]}
            </span>
            {!required && <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-600">Optional</span>}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() !== part.title && save({ title })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            maxLength={200}
            placeholder="Add a heading (optional)"
            aria-label={`Heading for part ${index + 1}`}
            className="mt-0.5 block w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-ink-950 outline-none transition-colors placeholder:font-normal placeholder:text-ink-400 hover:bg-ink-50 focus:bg-white focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <span className="hidden sm:block">
          <StatusBadge status={part.status} />
        </span>

        <span className="inline-flex">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="size-4" />
          </button>
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse part" : "Edit part"}
          className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-xs text-ink-500 hover:bg-canvas/60"
        >
          <span className="sm:hidden">
            <StatusBadge status={part.status} />
          </span>
          <span className="min-w-0 flex-1 truncate">{part.summary}</span>
        </button>
      )}

      {expanded && (
        <div className="border-t border-line">
          <div className="p-4 sm:p-5">{part.editor}</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line bg-canvas/50 px-4 py-3 sm:px-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => {
                  setRequired(e.target.checked);
                  save({ required: e.target.checked });
                }}
                className="size-4 accent-primary-600"
              />
              Learners must complete this
            </label>

            {mediaLength ? (
              part.durationMin ? <span className="text-sm text-ink-500">Length: {part.durationMin} min (from the file)</span> : null
            ) : (
              part.type !== "QUIZ" && (
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  Time
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    onBlur={() => {
                      const next = minutes === "" ? null : Math.max(0, Math.round(Number(minutes)));
                      if (next !== (part.durationMin ?? null)) save({ durationMin: next });
                    }}
                    placeholder="–"
                    className="h-8 w-16 rounded-lg border border-line bg-white px-2 text-sm outline-none focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
                  />
                  min
                </label>
              )
            )}

            <span className="ml-auto flex items-center gap-2">
              {pending && <Loader2 className="size-4 animate-spin text-ink-400" />}
              {error && <span className="text-xs text-accent-600">{error}</span>}
              <DeleteButton onDelete={() => deleteBlock(part.id)} confirmText={DELETE_WARNING[part.type]} label="Delete part" />
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

