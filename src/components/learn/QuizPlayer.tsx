"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { EASE } from "@/components/motion";
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
  const router = useRouter();
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

  function setBlank(q: LearnerQuestion, index: number, value: string) {
    setAnswers((prev) => {
      const current = [...(prev[q.id] ?? Array.from({ length: blankCount(q) }, () => ""))];
      current[index] = value;
      return { ...prev, [q.id]: current };
    });
  }

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

      {questions.map((q, i) => {
        const result = resultFor(q.id);
        return (
          <fieldset key={q.id} className="card p-6">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="text-xs font-medium text-ink-500">
              Question {i + 1} of {questions.length}
            </div>
            <div className="mt-2 flex items-start gap-3">
              <p className="flex-1 text-[15px] font-medium leading-relaxed text-ink-950">
                {q.type === "FILL_BLANK" ? "Fill in the blanks" : q.prompt}
              </p>
              {result && (result.correct ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-5 shrink-0 text-accent-500" />
              ))}
            </div>
            {q.type === "MULTIPLE" && <p className="mt-1 text-xs text-ink-500">Select all that apply</p>}
            {q.type === "FILL_BLANK" ? (
              <FillBlanks
                question={q}
                values={answers[q.id] ?? []}
                result={result}
                disabled={Boolean(outcome)}
                onChange={(bi, v) => setBlank(q, bi, v)}
              />
            ) : (
              <div className="mt-4 space-y-2">
                {q.options.map((o, oi) => {
                  const chosen = answers[q.id]?.includes(o.id) ?? false;
                  const isCorrect = result?.correctOptionIds?.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm text-ink-800 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-300",
                        chosen ? "border-primary-500 bg-primary-50/70 text-ink-950" : "border-line hover:border-ink-300 hover:bg-canvas",
                        isCorrect && "border-emerald-500 bg-emerald-50/70",
                        outcome && "cursor-default"
                      )}
                    >
                      <input
                        type={q.type === "MULTIPLE" ? "checkbox" : "radio"}
                        name={q.id}
                        checked={chosen}
                        disabled={Boolean(outcome)}
                        onChange={() => toggle(q, o.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-7 shrink-0 place-items-center border text-xs font-semibold transition-colors",
                          q.type === "MULTIPLE" ? "rounded-md" : "rounded-full",
                          isCorrect
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : chosen
                              ? "border-primary-600 bg-primary-600 text-white"
                              : "border-line bg-white text-ink-500"
                        )}
                      >
                        {chosen || isCorrect ? <Check className="size-3.5" /> : String.fromCharCode(65 + oi)}
                      </span>
                      {o.text}
                    </label>
                  );
                })}
              </div>
            )}
            {result?.explanation && <p className="mt-3 text-sm text-ink-500">{result.explanation}</p>}
          </fieldset>
        );
      })}

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

const blankCount = (q: LearnerQuestion) => Math.max(0, (q.segments?.length ?? 1) - 1);

function isAnswered(q: LearnerQuestion, given: string[] | undefined) {
  if (q.type !== "FILL_BLANK") return Boolean(given?.length);
  return Array.from({ length: blankCount(q) }, (_, i) => given?.[i]?.trim()).every(Boolean);
}

/** The sentence with a text box in each blank; after marking, wrong blanks show the accepted answers when revealed. */
function FillBlanks({
  question,
  values,
  result,
  disabled,
  onChange,
}: {
  question: LearnerQuestion;
  values: string[];
  result: QuestionResult | undefined;
  disabled: boolean;
  onChange: (index: number, value: string) => void;
}) {
  const segments = question.segments ?? [question.prompt];
  return (
    <div className="mt-4">
      <p className="text-[15px] leading-[2.6] text-ink-900">
        {segments.map((seg, i) => {
          const right = result?.blanks?.[i];
          return (
            <span key={i}>
              {seg}
              {i < segments.length - 1 && (
                <input
                  type="text"
                  value={values[i] ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange(i, e.target.value)}
                  aria-label={`Blank ${i + 1}`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={200}
                  size={Math.max(8, (values[i]?.length ?? 0) + 2)}
                  className={cn(
                    "mx-1 inline-block max-w-full rounded-lg border bg-white px-2 py-1 text-center text-[15px] leading-normal text-ink-950 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-200 disabled:cursor-default",
                    right === true && "border-emerald-500 bg-emerald-50/70",
                    right === false && "border-accent-400 bg-accent-50/70",
                    right === undefined && "border-ink-300"
                  )}
                />
              )}
            </span>
          );
        })}
      </p>
      {result?.correctAnswers && result.blanks?.some((b) => !b) && (
        <ul className="mt-2 space-y-0.5 text-sm text-ink-600">
          {result.correctAnswers.map((accepted, i) =>
            result.blanks?.[i] ? null : (
              <li key={i}>
                <span className="font-medium text-ink-800">Blank {i + 1}:</span>{" "}
                <span className="text-emerald-700">{accepted.join(" or ")}</span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
