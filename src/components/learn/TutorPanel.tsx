"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Lock, Sparkles, Square, X } from "lucide-react";
import { FormError } from "@/components/ui/TextField";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";

const STARTERS = ["Summarise this lesson", "Explain the key terms", "Quiz me on this"];

/** Error text from the route's JSON body, or a generic fallback. */
function errorText(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return "The tutor couldn't answer just now. Please try again.";
}

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

export function TutorPanel({
  lessonId,
  lessonTitle,
  locked,
}: {
  lessonId: string;
  lessonTitle: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages, sendMessage, status, stop, error, clearError } = useChat({
    id: `tutor-${lessonId}`,
    transport: new DefaultChatTransport({
      api: `/api/lms/tutor/${lessonId}`,
      // The server keeps the history; only the new question is sent.
      prepareSendMessagesRequest: ({ messages }) => ({ body: { text: textOf(messages[messages.length - 1]) } }),
    }),
  });
  const busy = status === "submitted" || status === "streaming";

  // Load the saved conversation the first time the panel opens.
  useEffect(() => {
    if (!open || loaded || locked) return;
    let cancelled = false;
    fetch(`/api/lms/tutor/${lessonId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { messages: { id: string; role: "user" | "assistant"; text: string }[] } | null) => {
        if (cancelled || !data) return;
        setMessages(data.messages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.text }] })));
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, loaded, locked, lessonId, setMessages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    if (error) clearError();
    sendMessage({ text: question });
    setInput("");
  }

  if (locked) {
    return (
      <div className="fixed bottom-5 right-5 z-40 hidden h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm text-ink-500 shadow-raised lg:inline-flex">
        <Lock className="size-4" />
        Finish the quiz to unlock the tutor
      </div>
    );
  }

  const last = messages[messages.length - 1];
  const thinking = status === "submitted" || (status === "streaming" && last?.role === "assistant" && !textOf(last));

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="launcher"
            onClick={() => setOpen(true)}
            className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-primary-950 pl-4 pr-5 text-sm font-medium text-white shadow-raised transition-colors hover:bg-primary-900"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Sparkles className="size-4 text-primary-200" />
            Ask the tutor
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <motion.div
              className="absolute inset-0 bg-ink-950/30"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
            <motion.aside
              role="dialog"
              aria-label="Lesson tutor"
              className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-canvas shadow-raised sm:w-[440px]"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <header className="flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
                <div className="min-w-0">
                  <div className="eyebrow flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary-600" /> Lesson tutor
                  </div>
                  <div className="mt-1 truncate font-display text-base text-ink-950">{lessonTitle}</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  aria-label="Close tutor"
                >
                  <X className="size-4" />
                </button>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
                {messages.length === 0 && !busy ? (
                  <div className="flex h-full flex-col justify-end">
                    <p className="font-display text-xl leading-tight text-ink-950">How can I help with this lesson?</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      Ask about anything in this lesson. Answers come from your course material, so check anything
                      important with your instructor.
                    </p>
                    <div className="mt-6 flex flex-col gap-2">
                      {STARTERS.map((s) => (
                        <button
                          key={s}
                          onClick={() => ask(s)}
                          className="card px-4 py-3 text-left text-sm text-ink-800 transition-colors hover:border-ink-300"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ol className="space-y-5">
                    {messages.map((m) => {
                      const text = textOf(m);
                      if (!text) return null;
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
                            <Streamdown
                              className="tutor-md"
                              controls={false}
                              isAnimating={status === "streaming" && m.id === last?.id}
                            >
                              {text}
                            </Streamdown>
                          )}
                        </motion.li>
                      );
                    })}
                    {thinking && (
                      <li className="flex items-center gap-1.5 py-2" aria-label="Tutor is thinking">
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
                    maxLength={2000}
                    placeholder="Ask a question…"
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
                <p className="mt-2 px-1 text-[11px] text-ink-400">
                  AI can make mistakes. This is training support, not clinical advice.
                </p>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
