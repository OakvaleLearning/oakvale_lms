"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { EASE } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { LearnerQuestion, QuestionResult } from "@/lib/lms/quiz";
import { isAnswered, QuestionCard } from "./QuestionCard";

interface Outcome {
  score: number;
  passed: boolean;
  attemptsLeft: number | null;
  results: QuestionResult[];
}

export function QuizPlayer({
  lessonId,
  questions,
  passMark,
  attemptsLeft: initialAttemptsLeft,
  bestScore,
  passed: alreadyPassed,
}: {
  lessonId: string;
  questions: LearnerQuestion[];
  passMark: number;
  attemptsLeft: number | null;
  bestScore: number | null;
  passed: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const attemptsLeft = outcome ? outcome.attemptsLeft : initialAttemptsLeft;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (questions.some((q) => !isAnswered(q, answers[q.id]))) {
      setError("Please answer every question.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/lms/quiz/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not submit");
      setOutcome(json);
      // Re-render server parts of the page, e.g. unlocking the tutor after a pass.
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setLoading(false);
    }
  }

  function retry() {
    setOutcome(null);
    setAnswers({});
  }

  const resultFor = (id: string) => outcome?.results.find((r) => r.questionId === id);
  const canSubmit = attemptsLeft === null || attemptsLeft > 0;
  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;

  return (
    <form onSubmit={submit} className="space-y-5">
      <dl className="card grid grid-cols-3 divide-x divide-line text-sm">
        <div className="px-5 py-4">
          <dt className="text-xs text-ink-500">Pass mark</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink-950">{passMark}%</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-xs text-ink-500">Best score</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink-950">
            {bestScore !== null ? `${bestScore}%` : "—"}
            {alreadyPassed && !outcome && <span className="ml-2 text-xs font-medium text-emerald-700">Passed</span>}
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-xs text-ink-500">Attempts left</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink-950">{attemptsLeft ?? "Unlimited"}</dd>
        </div>
      </dl>

      {outcome && (
        <motion.div
          key={outcome.score}
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className={cn(
            "flex items-center gap-5 rounded-2xl border p-6",
            outcome.passed
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
              : "border-accent-200 bg-accent-50/70 text-accent-900"
          )}
        >
          {outcome.passed ? <CheckCircle2 className="size-8 shrink-0" /> : <XCircle className="size-8 shrink-0" />}
          <div>
            <div className="font-display text-4xl leading-none tabular-nums">{outcome.score}%</div>
            <div className="mt-1 text-sm opacity-80">
              {outcome.passed ? "Well done, you passed!" : `You need ${passMark}% to pass.`}
            </div>
          </div>
        </motion.div>
      )}

      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          total={questions.length}
          value={answers[q.id]}
          result={resultFor(q.id)}
          disabled={Boolean(outcome)}
          onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
        />
      ))}

      {error && <p className="text-sm text-accent-600">{error}</p>}

      {outcome ? (
        !outcome.passed &&
        canSubmit && (
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        )
      ) : canSubmit ? (
        <div className="z-30 flex lg:sticky lg:bottom-4 items-center justify-between gap-4 rounded-2xl border border-line bg-white/95 p-3 pl-5 shadow-raised backdrop-blur">
          <span className="text-sm text-ink-600">
            <span className="font-medium tabular-nums text-ink-950">{answered}</span> of {questions.length} answered
          </span>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Submit answers
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-500">You have used all your attempts for this quiz.</p>
      )}
    </form>
  );
}
