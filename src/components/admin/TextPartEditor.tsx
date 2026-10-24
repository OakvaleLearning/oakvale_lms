"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, CheckCircle2, Heading2, Italic, Link2, List, ListOrdered, Loader2, Quote } from "lucide-react";
import { updateBlock } from "@/app/admin/lessons/[id]/actions";
import { LessonMarkdown } from "@/components/learn/LessonMarkdown";
import { MAX_TEXT_CHARS } from "@/lib/lms/blocks";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "bold", label: "Bold (Ctrl+B)", icon: Bold },
  { id: "italic", label: "Italic (Ctrl+I)", icon: Italic },
  { id: "h", label: "Heading", icon: Heading2 },
  { id: "ul", label: "Bulleted list", icon: List },
  { id: "ol", label: "Numbered list", icon: ListOrdered },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "link", label: "Link", icon: Link2 },
] as const;

type SaveState = "saved" | "dirty" | "saving" | "error";

/**
 * Write a text part in Markdown, with a toolbar and a live preview. Saves by
 * itself a moment after you stop typing, and when you leave the box.
 */
export function TextPartEditor({ blockId, initial }: { blockId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(initial);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(
    async (text: string) => {
      clearTimeout(timer.current);
      if (text === saved.current) return setState("saved");
      setState("saving");
      const res = await updateBlock(blockId, { body: text });
      if (!res.ok) {
        setError(res.error);
        return setState("error");
      }
      setError("");
      saved.current = text;
      // Keep typing while saving: only call it saved if nothing changed meanwhile.
      setState(latest.current === text ? "saved" : "dirty");
    },
    [blockId]
  );

  function change(text: string) {
    latest.current = text;
    setValue(text);
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(text), 900);
  }

  // Leaving the page (or collapsing the part) must not lose the last few words.
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      if (latest.current !== saved.current) void updateBlock(blockId, { body: latest.current });
    };
  }, [blockId]);

  /** Wrap the selection (or a placeholder) in Markdown marks. */
  function wrap(before: string, after = before, placeholder = "text") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b) || placeholder;
    change(value.slice(0, a) + before + picked + after + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + picked.length);
    });
  }

  /** Start each selected line with `prefix` (a number for lists is added per line). */
  function prefixLines(prefix: string | ((n: number) => string)) {
    const el = area.current;
    if (!el) return;
    const start = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const endIdx = value.indexOf("\n", el.selectionEnd);
    const end = endIdx === -1 ? value.length : endIdx;
    const lines = value.slice(start, end).split("\n");
    const out = lines.map((l, i) => (typeof prefix === "string" ? prefix : prefix(i + 1)) + l).join("\n");
    change(value.slice(0, start) + out + value.slice(end));
    requestAnimationFrame(() => el.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "b") {
      e.preventDefault();
      wrap("**");
    }
    if (e.key === "i") {
      e.preventDefault();
      wrap("*");
    }
  }


  function runTool(id: (typeof TOOLS)[number]["id"]) {
    if (id === "bold") wrap("**");
    else if (id === "italic") wrap("*");
    else if (id === "h") prefixLines("## ");
    else if (id === "ul") prefixLines("- ");
    else if (id === "ol") prefixLines((n) => `${n}. `);
    else if (id === "quote") prefixLines("> ");
    else wrap("[", "](https://)", "link text");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-canvas/50 px-2 py-1.5">
        <div role="tablist" className="mr-2 inline-flex rounded-lg bg-ink-100 p-0.5 text-xs font-medium">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 capitalize transition-colors",
                tab === t ? "bg-white text-ink-950 shadow-sm" : "text-ink-600 hover:text-ink-900"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "write" &&
          TOOLS.map(({ label, icon: Icon, id }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runTool(id)}
              className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <Icon className="size-4" />
            </button>
          ))}
        <span className="ml-auto inline-flex items-center gap-1.5 pr-1 text-xs text-ink-500" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </>
          )}
          {state === "saved" && (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Saved
            </>
          )}
          {state === "dirty" && "Unsaved changes"}
          {state === "error" && <span className="text-accent-600">{error || "Couldn't save"}</span>}
        </span>
      </div>

      {tab === "write" ? (
        <textarea
          ref={area}
          value={value}
          maxLength={MAX_TEXT_CHARS}
          onChange={(e) => change(e.target.value)}
          onBlur={() => void save(latest.current)}
          onKeyDown={onKeyDown}
          rows={12}
          placeholder={"Write the lesson here.\n\n## Use headings for sections\nShort paragraphs, **bold** key terms, and lists for steps:\n- First do this\n- Then this"}
          className="block min-h-72 w-full resize-y bg-white px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400"
        />
      ) : (
        <div className="min-h-72 px-5 py-4">
          {value.trim() ? <LessonMarkdown>{value}</LessonMarkdown> : <p className="text-sm text-ink-400">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
