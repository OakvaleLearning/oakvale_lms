"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowUp, Loader2, RotateCcw } from "lucide-react";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  fromSupport: boolean;
  senderName: string;
  body: string;
  createdAt: string;
  /** Client-only: a message still being sent, or one that failed. */
  state?: "sending" | "failed";
}

export type ChatStatus = "OPEN" | "RESOLVED" | null;

const POLL_MS = 4000;

/** Fired whenever this view has marked messages read, so badges can recount. */
export const SUPPORT_READ_EVENT = "support:read";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function errorFrom(json: unknown, fallback: string) {
  return (json as { error?: string } | null)?.error ?? fallback;
}

/**
 * A conversation thread that polls for new messages while the tab is visible.
 * `viewer` decides which side is "mine": the learner's messages or the support team's.
 */
export function SupportChat({
  endpoint,
  viewer,
  initialMessages,
  initialStatus,
  empty,
  starters,
  placeholder = "Write a message…",
  onStatus,
  onSent,
  className,
}: {
  endpoint: string;
  viewer: "learner" | "support";
  initialMessages: ChatMessage[];
  initialStatus: ChatStatus;
  empty?: ReactNode;
  /** Topics shown in the empty state; picking one starts the message. */
  starters?: string[];
  placeholder?: string;
  onStatus?: (status: ChatStatus) => void;
  onSent?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<ChatStatus>(initialStatus);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tempCount = useRef(0);
  const lastSeen = useRef(initialMessages.at(-1)?.createdAt);

  const isMine = useCallback((m: ChatMessage) => (viewer === "support" ? m.fromSupport : !m.fromSupport), [viewer]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    lastSeen.current = incoming.at(-1)!.createdAt;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !ids.has(m.id))];
    });
  }, []);

  const updateStatus = useCallback(
    (next: ChatStatus) => {
      setStatus(next);
      onStatus?.(next);
    },
    [onStatus]
  );

  // The server marked the thread read when it rendered this page.
  useEffect(() => {
    window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
  }, [endpoint]);

  // Poll for replies while the page is visible.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const url = lastSeen.current ? `${endpoint}?after=${encodeURIComponent(lastSeen.current)}` : endpoint;
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as { status: ChatStatus; messages: ChatMessage[] };
      merge(data.messages);
      updateStatus(data.status);
      if (data.messages.length) window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [endpoint, merge, updateStatus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function deliver(tempId: string, body: string) {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, state: "sending" } : m)));
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setError(errorFrom(json, "Your message couldn't be sent. Check your connection and try again."));
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, state: "failed" } : m)));
      return;
    }
    const saved = (json as { message: ChatMessage }).message;
    lastSeen.current = saved.createdAt;
    // A poll may have already delivered the saved copy; drop the placeholder either way.
    setMessages((prev) =>
      prev.some((m) => m.id === saved.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? saved : m))
    );
    if (viewer === "learner") updateStatus("OPEN");
    onSent?.();
  }

  function send() {
    const body = input.trim();
    if (!body) return;
    setError("");
    setInput("");
    const tempId = `temp-${++tempCount.current}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        fromSupport: viewer === "support",
        senderName: "You",
        body,
        createdAt: new Date().toISOString(),
        state: "sending",
      },
    ]);
    deliver(tempId, body);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="max-w-sm text-center">
              {empty}
              {starters && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {starters.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setInput(`I need help with ${t.toLowerCase()}: `);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-700 ring-1 ring-line transition-colors hover:bg-ink-50 hover:text-ink-950"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ol className="space-y-1.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = isMine(m);
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const startsGroup = newDay || !prev || prev.fromSupport !== m.fromSupport;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="flex justify-center py-3">
                      <span suppressHydrationWarning className="rounded-full bg-white px-3 py-1 text-xs text-ink-500 ring-1 ring-line">
                        {dayLabel(m.createdAt)}
                      </span>
                    </li>
                  )}
                  <motion.li
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className={cn("flex flex-col", mine ? "items-end" : "items-start", startsGroup && i > 0 && "pt-3")}
                  >
                    {startsGroup && !mine && (
                      <span className="mb-1 px-1 text-xs font-medium text-ink-600">{m.senderName}</span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%]",
                        mine
                          ? "rounded-br-md bg-primary-950 text-white"
                          : "rounded-bl-md border border-line bg-white text-ink-900 shadow-card",
                        m.state === "sending" && "opacity-70",
                        m.state === "failed" && "bg-accent-700"
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-ink-400">
                      {m.state === "sending" ? (
                        "Sending…"
                      ) : m.state === "failed" ? (
                        <button
                          type="button"
                          onClick={() => deliver(m.id, m.body)}
                          className="inline-flex items-center gap-1 font-medium text-accent-700 hover:underline"
                        >
                          <RotateCcw className="size-3" /> Not sent — tap to retry
                        </button>
                      ) : (
                        <span suppressHydrationWarning>{timeLabel(m.createdAt)}</span>
                      )}
                    </span>
                  </motion.li>
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t border-line bg-white px-3 pb-3 pt-3 sm:px-4">
        <AnimatePresence>
          {status === "RESOLVED" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 px-1 text-xs text-ink-500"
            >
              {viewer === "learner"
                ? "This conversation was marked as resolved. Send a message any time to reopen it."
                : "Resolved. A new message from the learner will reopen it."}
            </motion.p>
          )}
        </AnimatePresence>
        {error && (
          <p role="alert" className="mb-2 flex items-start gap-1.5 px-1 text-xs text-accent-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 rounded-xl border border-line bg-white p-1.5 shadow-card transition-colors focus-within:border-primary-500 focus-within:ring-3 focus-within:ring-primary-100"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={placeholder}
            aria-label="Message"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-ink-900 outline-none [field-sizing:content] placeholder:text-ink-400"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:bg-ink-200"
            aria-label="Send message"
          >
            {messages.some((m) => m.state === "sending") ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </form>
        <p className="mt-1.5 hidden px-1 text-[11px] text-ink-400 sm:block">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  );
}
