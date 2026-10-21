import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getLearnerConversation, listSupportMessages, markReadByLearner } from "@/lib/support";
import { PageHeader } from "@/components/dashboard/ui";
import { SupportChat } from "@/components/support/SupportChat";

export const metadata: Metadata = { title: "Support" };

const TOPICS = ["Course content", "Payments & enrolment", "My account", "Certificates"];

export default async function SupportPage() {
  const session = await requireSession("/support");
  const conversation = await getLearnerConversation(session.userId);
  const messages = conversation ? await listSupportMessages(conversation.id) : [];
  if (conversation) await markReadByLearner(conversation.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Help"
        title="Chat with support"
        description="Message the Oakvale team about anything — your course, payments or your account. Replies appear here, so you can leave and come back."
      />

      <section className="card mt-8 flex h-[calc(100dvh-16rem)] min-h-[28rem] flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-primary-50 text-primary-700">
            <LifeBuoy className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-ink-950">Oakvale Support</div>
            <div className="text-xs text-ink-500">We&apos;ll reply here as soon as we can</div>
          </div>
        </header>
        <SupportChat
          className="flex-1"
          endpoint="/api/support"
          viewer="learner"
          initialMessages={messages}
          initialStatus={conversation?.status ?? null}
          placeholder="Type your question…"
          starters={TOPICS}
          empty={
            <>
              <p className="font-display text-lg text-ink-950">How can we help?</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                Pick a topic or just type your question. Details like the course or lesson name help us answer faster.
              </p>
            </>
          }
        />
      </section>
    </div>
  );
}
