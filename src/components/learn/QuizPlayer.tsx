"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
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

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A lesson quiz or final assessment, one question at a time. Untimed, learners
 * can move back and forth (and jump with the numbers) before submitting. With
 * `secondsPerQuestion`, each question has a countdown, there's no going back,
 * and it moves on by itself when time runs out; the last one submits. After
 * submitting, learners step through their results.
 */
export function QuizPlayer({
  lessonId,
  questions,
  passMark,
  secondsPerQuestion,
  attemptsLeft: initialAttemptsLeft,
  bestScore,
  passed: alreadyPassed,
}: {
  lessonId: string;
  questions: LearnerQuestion[];
  passMark: number;
  secondsPerQuestion: number | null;
  attemptsLeft: number | null;
  bestScore: number | null;
  passed: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  // Timed quizzes start when the learner says so, so the clock doesn't run while they read the page.
  const [started, setStarted] = useState(false);
  const answersRef = useRef<Record<string, string[]>>({});
  const submitting = useRef(false);
  const router = useRouter();

  const attemptsLeft = outcome ? outcome.attemptsLeft : initialAttemptsLeft;
  const canSubmit = attemptsLeft === null || attemptsLeft > 0;
  const timed = Boolean(secondsPerQuestion) && !outcome;
  const reviewing = Boolean(outcome);
  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answered = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const resultFor = (id: string) => outcome?.results.find((r) => r.questionId === id);

  const submit = useCallback(
    async (force = false) => {
      if (submitting.current) return;
      const current = answersRef.current;
      const firstGap = questions.findIndex((x) => !isAnswered(x, current[x.id]));
      if (!force && firstGap !== -1) {
        setIndex(firstGap);
        setError(`Question ${firstGap + 1} still needs an answer.`);
        return;
      }
      submitting.current = true;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/lms/quiz/${lessonId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: current }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not submit");
        setOutcome(json);
        setIndex(0);
        // Re-render server parts of the page, e.g. unlocking the tutor after a pass.
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit");
      } finally {
        submitting.current = false;
        setLoading(false);
      }
    },
    [lessonId, questions, router]
  );

  /** Timed: move on (no way back); the last question submits whatever is answered. */
  const moveOn = useCallback(() => {
    setError("");
    if (index >= questions.length - 1) void submit(true);
    else setIndex(index + 1);
  }, [index, questions.length, submit]);

  // Each question's countdown, restarting when the question changes.
  useEffect(() => {
    if (!timed || !started || !secondsPerQuestion) return;
    const endsAt = Date.now() + secondsPerQuestion * 1000;
    let fired = false;
    const tick = () => {
      const ms = endsAt - Date.now();
      setLeft(ms);
      if (ms <= 0 && !fired) {
        fired = true;
        moveOn();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timed, started, secondsPerQuestion, index, moveOn]);

  function change(value: string[]) {
    const next = { ...answersRef.current, [q.id]: value };
    answersRef.current = next;
    setAnswers(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (timed) moveOn();
    else if (isLast) void submit();
    else setIndex(index + 1);
  }

  function retry() {
    answersRef.current = {};
    setAnswers({});
    setOutcome(null);
    setIndex(0);
    setStarted(false);
    setLeft(null);
  }

  const share = left !== null && secondsPerQuestion ? Math.max(0, Math.min(1, left / (secondsPerQuestion * 1000))) : 1;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
              {outcome.passed ? "Well done, you passed!" : `You need ${passMark}% to pass.`} Go through your answers below.
            </div>
          </div>
        </motion.div>
      )}

      {!canSubmit && !outcome ? (
        <p className="text-sm text-ink-500">You have used all your attempts for this quiz.</p>
      ) : timed && !started ? (
        <div className="card flex flex-col items-start gap-4 p-6">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary-600" />
            <div>
              <p className="font-medium text-ink-950">
                {questions.length} {questions.length === 1 ? "question" : "questions"}, {secondsPerQuestion} seconds each
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Questions come one at a time. When a question&apos;s time runs out you move to the next one, and you
                can&apos;t go back.
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => setStarted(true)}>
            Start
          </Button>
        </div>
      ) : (
        <>
          {/* Where you are: numbers to jump between (untimed or reviewing), or just progress (timed). */}
          {timed ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-900">
                  Question {index + 1} of {questions.length}
                </span>
                {left !== null && (
                  <span className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", left < 10_000 ? "text-accent-700" : "text-ink-800")}>
                    <Clock className="size-4" /> {formatClock(left)}
                  </span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <div
                  className={cn("h-full rounded-full transition-[width] duration-300 ease-linear", left !== null && left < 10_000 ? "bg-accent-500" : "bg-primary-500")}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
              {questions.map((x, i) => {
                const r = resultFor(x.id);
                const done = isAnswered(x, answers[x.id]);
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => {
                      setError("");
                      setIndex(i);
                    }}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`Question ${i + 1}${r ? (r.correct ? ", correct" : ", incorrect") : done ? ", answered" : ""}`}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg border text-xs font-medium tabular-nums transition-colors",
                      r
                        ? r.correct
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-accent-200 bg-accent-50 text-accent-800"
                        : done
                          ? "border-primary-200 bg-primary-50 text-primary-800"
                          : "border-line bg-white text-ink-600 hover:border-ink-300",
                      i === index && "ring-2 ring-primary-500 ring-offset-1"
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </nav>
          )}

          <QuestionCard
            key={q.id}
            question={q}
            index={index}
            total={questions.length}
            value={answers[q.id]}
            result={resultFor(q.id)}
            disabled={reviewing || loading}
            onChange={change}
          />

          {error && <p className="text-sm text-accent-600">{error}</p>}

          <div className="z-30 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-3 shadow-raised backdrop-blur lg:sticky lg:bottom-4">
            {timed ? (
              <span className="pl-2 text-xs text-ink-500">No going back once you move on.</span>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                <ArrowLeft className="size-4" /> Previous
              </Button>
            )}
            {!reviewing && !timed && (
              <span className="hidden text-sm text-ink-600 sm:inline">
                <span className="font-medium tabular-nums text-ink-950">{answered}</span> of {questions.length} answered
              </span>
            )}
            {reviewing ? (
              isLast ? (
                !outcome!.passed && canSubmit ? (
                  <Button type="button" onClick={retry}>
                    Try again
                  </Button>
                ) : (
                  <span />
                )
              ) : (
                <Button type="button" variant="outline" onClick={() => setIndex(index + 1)}>
                  Next <ArrowRight className="size-4" />
                </Button>
              )
            ) : (
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {isLast ? "Submit answers" : timed ? "Next question" : "Next"}
                {!isLast && <ArrowRight className="size-4" />}
              </Button>
            )}
          </div>

          {reviewing && !outcome!.passed && canSubmit && !isLast && (
            <Button type="button" variant="outline" onClick={retry}>
              Try again
            </Button>
          )}
        </>
      )}
    </form>
  );
}
