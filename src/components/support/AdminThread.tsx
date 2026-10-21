"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SupportChat, type ChatMessage, type ChatStatus } from "./SupportChat";

/** The selected conversation in the admin inbox, with resolve / reopen. */
export function AdminThread({
  conversationId,
  learnerName,
  initialMessages,
  initialStatus,
  header,
}: {
  header: ReactNode;
  conversationId: string;
  learnerName: string;
  initialMessages: ChatMessage[];
  initialStatus: "OPEN" | "RESOLVED";
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ChatStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/admin/support/${conversationId}`;

  async function toggle() {
    const next = status === "RESOLVED" ? "OPEN" : "RESOLVED";
    setSaving(true);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        {header}
        <Button variant={status === "RESOLVED" ? "outline" : "primary"} size="sm" onClick={toggle} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : status === "RESOLVED" ? (
            <RotateCcw className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          <span className="hidden sm:inline">{status === "RESOLVED" ? "Reopen" : "Mark resolved"}</span>
          <span className="sm:hidden">{status === "RESOLVED" ? "Reopen" : "Resolve"}</span>
        </Button>
      </header>
      <SupportChat
        className="min-h-0 flex-1"
        endpoint={endpoint}
        viewer="support"
        initialMessages={initialMessages}
        initialStatus={initialStatus}
        onStatus={setStatus}
        // Update the list's preview and "Awaiting reply" tag.
        onSent={() => router.refresh()}
        placeholder={`Reply to ${learnerName.split(" ")[0]}…`}
      />
    </>
  );
}

/** Re-renders the inbox list every so often so new conversations show up. */
export function InboxRefresher({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
