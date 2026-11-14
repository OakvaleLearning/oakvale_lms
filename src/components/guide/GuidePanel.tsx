"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Streamdown, type Components } from "streamdown";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp, Compass, Play, RotateCcw, Square, X } from "lucide-react";
import { FormError } from "@/components/ui/TextField";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";
import { getWalkthrough, rankForPage, walkthroughsFor, type GuideAudience } from "@/lib/guide/walkthroughs";
import { closeGuide, openGuide, startTour, useGuide } from "./store";

/**
 * The Oakvale Guide: a help panel for finding your way around the app. It
 * opens from the sidebar's "Help & guide" (never a floating button, so it
 * can't sit on top of the lesson tutor's launcher) and slides in from the
 * left, where the tutor comes from the right.
 */

const CHAT_KEY = "oakvale-guide-chat";
const WALKTHROUGH_TOOL = "tool-show_walkthrough";

const STARTERS: Record<GuideAudience, string[]> = {
  admin: ["How do I make a module visible to learners?", "Where do I set a programme's price?"],
  learner: ["How do I get my certificate?", "Where do I contact support?"],
};

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

/** The walkthrough an assistant message offered, if any. */
function offeredWalkthrough(m: UIMessage): string | null {
  for (const part of m.parts) {
    if (part.type !== WALKTHROUGH_TOOL) continue;
    const input = (part as { input?: { id?: unknown } }).input;
    if (typeof input?.id === "string" && getWalkthrough(input.id)) return input.id;
  }
  return null;
}

/** History in the compact form the route expects. */
function compact(messages: UIMessage[]) {
  return messages
    .map((m) => {
      const offered = m.role === "assistant" ? offeredWalkthrough(m) : null;
      const text = [textOf(m).trim(), offered && `(Offered the "${getWalkthrough(offered)!.title}" walkthrough.)`]
        .filter(Boolean)
        .join("\n");
      return { role: m.role === "user" ? ("user" as const) : ("assistant" as const), text };
    })
    .filter((m) => m.text);
}

function errorText(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return "The guide couldn't answer just now. Please try again.";
}

/** Sidebar entry that opens the guide. */
export function GuideNavButton({ onOpen }: { onOpen?: () => void }) {
  const { panelOpen } = useGuide();
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openGuide();
      }}
      aria-expanded={panelOpen}
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
    >
      <Compass className="size-4 text-primary-600" />
      <span className="flex-1 text-left">Help &amp; guide</span>
    </button>
  );
}

/** Icon button for the dashboard header. */
export function GuideTopbarButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openGuide}
      className={className ?? "grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100"}
      aria-label="Help & guide"
    >
      <Compass className="size-5" />
    </button>
  );
}

export function GuidePanel({ audience }: { audience: GuideAudience }) {
  const { panelOpen: open } = useGuide();
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const restored = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, sendMessage, status, stop, error, clearError } = useChat({
    id: `guide-${audience}`,
    transport: new DefaultChatTransport({
      api: "/api/guide",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { path: window.location.pathname, messages: compact(messages) },
      }),
    }),
  });
  const busy = status === "submitted" || status === "streaming";

  // The conversation survives page loads within the browser session.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = sessionStorage.getItem(`${CHAT_KEY}-${audience}`);
      if (saved) setMessages(JSON.parse(saved) as UIMessage[]);
    } catch {}
  }, [audience, setMessages]);

  useEffect(() => {
    if (busy || !restored.current) return;
    try {
      sessionStorage.setItem(`${CHAT_KEY}-${audience}`, JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages, busy, audience]);

  // Closing the panel leaves the walkthrough list.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setBrowsing(false);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages, status, browsing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeGuide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const all = useMemo(() => rankForPage(walkthroughsFor(audience), pathname), [audience, pathname]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    if (error) clearError();
    setBrowsing(false);
    sendMessage({ text: question });
    setInput("");
  }

  function reset() {
    stop();
    setMessages([]);
    clearError();
    try {
      sessionStorage.removeItem(`${CHAT_KEY}-${audience}`);
    } catch {}
  }

  const last = messages[messages.length - 1];
  const thinking =
    status === "submitted" || (status === "streaming" && last?.role === "assistant" && !textOf(last) && !offeredWalkthrough(last));
  const empty = messages.length === 0 && !busy;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" data-guide-ui>
          <motion.div
            className="absolute inset-0 bg-ink-950/30"
            onClick={closeGuide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.aside
            role="dialog"
            aria-label="Oakvale Guide"
            className="absolute inset-y-0 left-0 flex w-full flex-col border-r border-line bg-canvas shadow-raised sm:w-[420px]"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="eyebrow flex items-center gap-1.5">
                  <Compass className="size-3.5 text-primary-600" /> Oakvale Guide
                </div>
                <div className="mt-1 font-display text-base text-ink-950">
                  {audience === "admin" ? "Find your way around admin" : "Find your way around"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    className="grid size-8 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                    aria-label="Start a new conversation"
                    title="New conversation"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                )}
                <button
                  onClick={closeGuide}
                  className="grid size-8 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  aria-label="Close guide"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
              {empty || browsing ? (
                <div>
                  {!browsing && (
                    <>
                      <p className="font-display text-xl leading-tight text-ink-950">What would you like to do?</p>
                      <p className="mt-2 text-sm leading-relaxed text-ink-500">
                        Ask me where something is, or pick a walkthrough and I&apos;ll point to each step on screen.
                      </p>
                    </>
                  )}
                  <WalkthroughList items={browsing ? all : all.slice(0, 5)} />
                  {!browsing && all.length > 5 && (
                    <button
                      onClick={() => setBrowsing(true)}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-900"
                    >
                      All {all.length} walkthroughs <ArrowRight className="size-3.5" />
                    </button>
                  )}
                  {browsing && messages.length > 0 && (
                    <button
                      onClick={() => setBrowsing(false)}
                      className="mt-3 text-sm font-medium text-primary-700 hover:text-primary-900"
                    >
                      Back to the conversation
                    </button>
                  )}
                  {!browsing && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {STARTERS[audience].map((s) => (
                        <button
                          key={s}
                          onClick={() => ask(s)}
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-ink-700 transition-colors hover:border-ink-300"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <ol className="space-y-5">
                  {messages.map((m) => {
                    const text = textOf(m);
                    const offered = m.role === "assistant" ? offeredWalkthrough(m) : null;
                    if (!text && !offered) return null;
                    return (
                      <motion.li
                        key={m.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className={cn(m.role === "user" && "flex justify-end")}
                      >
                        {m.role === "user" ? (
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-950 px-4 py-2.5 text-sm leading-relaxed text-white">
                            {text}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {text && (
                              <Streamdown
                                className="tutor-md"
                                controls={false}
                                isAnimating={status === "streaming" && m.id === last?.id}
                                components={MARKDOWN}
                              >
                                {text}
                              </Streamdown>
                            )}
                            {offered && <WalkthroughOffer id={offered} />}
                          </div>
                        )}
                      </motion.li>
                    );
                  })}
                  {thinking && (
                    <li className="flex items-center gap-1.5 py-2" aria-label="Guide is thinking">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="size-1.5 rounded-full bg-ink-400"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </li>
                  )}
                </ol>
              )}
            </div>

            <div className="border-t border-line bg-white px-4 pb-4 pt-3">
              {error && (
                <div className="mb-3">
                  <FormError>{errorText(error)}</FormError>
                </div>
              )}
              {!empty && !browsing && (
                <button
                  onClick={() => setBrowsing(true)}
                  className="mb-2 px-1 text-xs font-medium text-primary-700 hover:text-primary-900"
                >
                  Browse walkthroughs
                </button>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
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
                      ask(input);
                    }
                  }}
                  rows={1}
                  maxLength={1000}
                  placeholder="How do I…"
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-ink-900 outline-none [field-sizing:content] placeholder:text-ink-400"
                />
                {busy ? (
                  <button
                    type="button"
                    onClick={() => stop()}
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-900 text-white transition-colors hover:bg-ink-800"
                    aria-label="Stop answering"
                  >
                    <Square className="size-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:bg-ink-200"
                    aria-label="Send question"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                )}
              </form>
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
                {audience === "learner"
                  ? "For help with what a lesson teaches, use “Ask the tutor” inside the lesson."
                  : "AI can make mistakes. Check important settings on screen."}
              </p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function WalkthroughList({ items }: { items: ReturnType<typeof walkthroughsFor> }) {
  return (
    <ul className="mt-5 space-y-2">
      {items.map((w) => (
        <li key={w.id}>
          <button
            onClick={() => startTour(w.id)}
            className="card group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:border-ink-300"
          >
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white">
              <Play className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-900">{w.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{w.summary}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WalkthroughOffer({ id }: { id: string }) {
  const w = getWalkthrough(id)!;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-600 text-white">
        <Compass className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-950">{w.title}</span>
        <span className="block text-xs text-ink-500">
          {w.steps.length} {w.steps.length === 1 ? "step" : "steps"}, highlighted on screen
        </span>
      </span>
      <button
        onClick={() => startTour(id)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
      >
        Show me <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

const MARKDOWN = { a: GuideLink } as Components;

/** In-app links navigate in place and close the panel; anything else opens in a new tab. */
function GuideLink({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (!href) return <>{children}</>;
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} onClick={closeGuide}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
