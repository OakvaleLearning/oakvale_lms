"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** For HTML lessons, which have no built-in way to report completion. */
export function MarkCompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (completed) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
        <CheckCircle2 className="size-5" /> Completed
      </span>
    );
  }

  async function complete() {
    setLoading(true);
    await fetch("/api/lms/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, completed: true }),
    }).catch(() => {});
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={complete} disabled={loading} variant="outline" size="sm">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      Mark as complete
    </Button>
  );
}
