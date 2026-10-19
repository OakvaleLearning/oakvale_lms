"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { LearnerQuestion, QuestionResult } from "@/lib/lms/quiz";

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
  const attemptsLeft = outcome ? outcome.attemptsLeft : initialAttemptsLeft;

  function toggle(q: LearnerQuestion, optionId: string) {
    setAnswers((prev) => {
      if (q.type !== "MULTIPLE") return { ...prev, [q.id]: [optionId] };
      const current = prev[q.id] ?? [];
      return {
        ...prev,
        [q.id]: current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId],
      };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (questions.some((q) => !answers[q.id]?.length)) {
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

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-3xl border border-ink-100 bg-white p-5 text-sm text-ink-600">
        Pass mark: <strong>{passMark}%</strong>
        {bestScore !== null && !outcome && <> · Best score so far: <strong>{bestScore}%</strong></>}
        {attemptsLeft !== null && <> · Attempts left: <strong>{attemptsLeft}</strong></>}
        {alreadyPassed && !outcome && <span className="ml-2 font-semibold text-emerald-600">Passed ✓</span>}
      </div>

      {outcome && (
        <div
          className={cn(
            "flex items-center gap-4 rounded-3xl p-6",
            outcome.passed ? "bg-emerald-50 text-emerald-800" : "bg-accent-50 text-accent-800"
          )}
        >
          {outcome.passed ? <CheckCircle2 className="size-10 shrink-0" /> : <XCircle className="size-10 shrink-0" />}
          <div>
            <div className="text-2xl font-black">{outcome.score}%</div>
            <div className="text-sm">
              {outcome.passed ? "Well done — you passed!" : `You need ${passMark}% to pass.`}
            </div>
          </div>
        </div>
      )}

      {questions.map((q, i) => {
        const result = resultFor(q.id);
        return (
          <fieldset key={q.id} className="rounded-3xl border border-ink-100 bg-white p-6">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="flex items-start gap-2">
              <span className="text-sm font-bold text-primary-600">{i + 1}.</span>
              <p className="flex-1 font-medium text-ink-900">{q.prompt}</p>
              {result && (result.correct ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-5 shrink-0 text-accent-500" />
              ))}
            </div>
            {q.type === "MULTIPLE" && <p className="mt-1 text-xs text-ink-400">Select all that apply</p>}
            <div className="mt-4 space-y-2">
              {q.options.map((o) => {
                const chosen = answers[q.id]?.includes(o.id) ?? false;
                const isCorrect = result?.correctOptionIds?.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
                      chosen ? "border-primary-400 bg-primary-50" : "border-ink-100 hover:border-ink-300",
                      isCorrect && "border-emerald-400 bg-emerald-50",
                      outcome && "cursor-default"
                    )}
                  >
                    <input
                      type={q.type === "MULTIPLE" ? "checkbox" : "radio"}
                      name={q.id}
                      checked={chosen}
                      disabled={Boolean(outcome)}
                      onChange={() => toggle(q, o.id)}
                      className="accent-primary-600"
                    />
                    {o.text}
                  </label>
                );
              })}
            </div>
            {result?.explanation && <p className="mt-3 text-sm text-ink-500">{result.explanation}</p>}
          </fieldset>
        );
      })}

      {error && <p className="text-sm text-accent-600">{error}</p>}

      {outcome ? (
        !outcome.passed && canSubmit && (
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        )
      ) : canSubmit ? (
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          Submit answers
        </Button>
      ) : (
        <p className="text-sm text-ink-500">You have used all your attempts for this quiz.</p>
      )}
    </form>
  );
}
