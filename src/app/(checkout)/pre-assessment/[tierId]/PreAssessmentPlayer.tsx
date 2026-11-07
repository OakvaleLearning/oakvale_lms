"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isAnswered, QuestionCard } from "@/components/learn/QuestionCard";
import type { LearnerQuestion } from "@/lib/lms/quiz";
import { submitPreAssessment } from "./actions";

/** Answers one pre-assessment attempt. The page shows the result after it re-renders. */
export function PreAssessmentPlayer({
  tierId,
  attemptId,
  questions,
}: {
  tierId: string;
  attemptId: string;
  questions: LearnerQuestion[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (answered < questions.length) {
      setError("Please answer every question.");
      return;
    }
    setError("");
    start(async () => {
      const res = await submitPreAssessment(tierId, attemptId, answers);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          total={questions.length}
          value={answers[q.id]}
          disabled={pending}
          onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
        />
      ))}

      {error && <p className="text-sm text-accent-600">{error}</p>}

      <div className="z-30 flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/95 p-3 pl-5 shadow-raised backdrop-blur sm:sticky sm:bottom-4">
        <span className="text-sm text-ink-600">
          <span className="font-medium tabular-nums text-ink-950">{answered}</span> of {questions.length} answered
        </span>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Submit answers
        </Button>
      </div>
    </form>
  );
}

/** Submit button for the start form, with a spinner while the questions are drawn. */
export function StartButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
