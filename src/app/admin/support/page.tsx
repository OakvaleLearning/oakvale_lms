import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Inbox, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { listSupportMessages, markReadBySupport } from "@/lib/support";
import { PageHeader } from "@/components/dashboard/ui";
import { AdminThread, InboxRefresher } from "@/components/support/AdminThread";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
] as const;

function shortTime(date: Date) {
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(
    "en-NG",
    sameDay ? { timeStyle: "short" } : { day: "numeric", month: "short" },
  ).format(date);
}

export default async function SupportInboxPage({
  searchParams,
}: PageProps<"/admin/support">) {
  await requireAdmin();
  const { c, view: viewParam } = await searchParams;
  const view = viewParam === "resolved" ? "resolved" : "open";
  const selectedId = typeof c === "string" ? c : undefined;

  const [conversations, counts] = await Promise.all([
    prisma.supportConversation.findMany({
      where: { status: view === "open" ? "OPEN" : "RESOLVED" },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, fromSupport: true },
        },
      },
    }),
    prisma.supportConversation.groupBy({ by: ["status"], _count: true }),
  ]);
  const countFor = (status: "OPEN" | "RESOLVED") =>
    counts.find((r) => r.status === status)?._count ?? 0;

  const selected = selectedId
    ? await prisma.supportConversation.findUnique({
        where: { id: selectedId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              enrollments: {
                where: { status: "ACTIVE" },
                select: {
                  tier: {
                    select: {
                      name: true,
                      program: { select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : null;
  const messages = selected ? await listSupportMessages(selected.id) : [];
  if (selected) await markReadBySupport(selected.id);

  const href = (params: { c?: string; view?: string }) => {
    const q = new URLSearchParams();
    if (params.view && params.view !== "open") q.set("view", params.view);
    if (params.c) q.set("c", params.c);
    const s = q.toString();
    return `/admin/support${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <InboxRefresher />
      <PageHeader
        eyebrow="Help desk"
        title="Support"
        description="Questions from learners. Replies show up in their Support page straight away."
      />

      <div className="card grid h-[calc(100dvh-15rem)] min-h-[30rem] overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Conversation list (hidden on small screens while a thread is open) */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-line lg:border-r",
            selected && "hidden lg:flex",
          )}
        >
          <div className="flex gap-1 border-b border-line p-2">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={href({ view: v.key })}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors",
                  view === v.key
                    ? "bg-ink-100 font-medium text-ink-950"
                    : "text-ink-600 hover:bg-ink-50",
                )}
              >
                {v.label}
                <span className="text-xs tabular-nums text-ink-500">
                  {countFor(v.key === "open" ? "OPEN" : "RESOLVED")}
                </span>
              </Link>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((conv) => {
              const last = conv.messages[0];
              const active = conv.id === selected?.id;
              // Opening a conversation marks it read.
              const unread =
                !active &&
                !conv.lastFromSupport &&
                conv.lastMessageAt > conv.supportLastReadAt;
              return (
                <li
                  key={conv.id}
                  className="border-b border-line/70 last:border-0"
                >
                  <Link
                    href={href({ view, c: conv.id })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative block px-4 py-3.5 transition-colors",
                      active ? "bg-primary-50/70" : "hover:bg-canvas",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-primary-600" />
                    )}
                    <div className="flex items-center gap-2">
                      {unread && (
                        <span
                          className="size-2 shrink-0 rounded-full bg-primary-600"
                          aria-label="Unread"
                        />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          unread
                            ? "font-semibold text-ink-950"
                            : "font-medium text-ink-900",
                        )}
                      >
                        {conv.user.name}
                      </span>
                      <span className="shrink-0 text-xs text-ink-400">
                        {shortTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-sm",
                        unread ? "text-ink-800" : "text-ink-500",
                      )}
                    >
                      {last
                        ? `${last.fromSupport ? "You: " : ""}${last.body}`
                        : "No messages"}
                    </p>
                    {view === "open" && !conv.lastFromSupport && (
                      <span className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Awaiting reply
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
            {conversations.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-ink-500">
                <Inbox className="mx-auto mb-3 size-5 text-ink-300" />
                {view === "open"
                  ? "No open conversations. You're all caught up."
                  : "No resolved conversations yet."}
              </li>
            )}
          </ul>
        </aside>

        {/* Selected thread */}
        <section
          className={cn(
            "min-h-0 flex-col",
            selected ? "flex" : "hidden lg:flex",
          )}
        >
          {selected ? (
            <AdminThread
              key={selected.id}
              header={
                <>
                  <Link
                    href={href({ view })}
                    className="grid size-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100 lg:hidden"
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="size-4" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink-950">
                      {selected.user.name}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {selected.user.email}
                      {selected.user.enrollments.length > 0 &&
                        ` · ${selected.user.enrollments.map((e) => `${e.tier.program.title} (${e.tier.name})`).join(", ")}`}
                    </div>
                  </div>
                  <Link
                    href={`/admin/learners/${selected.user.id}`}
                    className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline sm:inline-flex"
                  >
                    Learner profile <ExternalLink className="size-3.5" />
                  </Link>
                </>
              }
              conversationId={selected.id}
              learnerName={selected.user.name}
              initialMessages={messages}
              initialStatus={selected.status}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <MessagesSquare className="mx-auto size-6 text-ink-300" />
                <p className="mt-3 text-sm text-ink-500">
                  Select a conversation to read and reply.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
