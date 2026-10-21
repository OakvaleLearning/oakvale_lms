"use client";

import { useState, useTransition } from "react";
import { Award, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { issueEligible } from "@/app/admin/certificates/actions";

/** Issues certificates to learners who already met the course's requirements. */
export function IssueEligibleButton({ courseId }: { courseId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await issueEligible(courseId);
            setMessage(
              !res.ok
                ? res.error
                : res.issued === 0
                  ? "Everyone who qualifies already has one."
                  : `Issued ${res.issued} ${res.issued === 1 ? "certificate" : "certificates"}.`
            );
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
        Issue to learners who qualify
      </Button>
      {message && <span className="text-xs text-ink-600">{message}</span>}
    </div>
  );
}
