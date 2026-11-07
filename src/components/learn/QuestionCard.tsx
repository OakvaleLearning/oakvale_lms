"use client";

import { Check, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearnerQuestion, QuestionResult } from "@/lib/lms/quiz";

/**
 * One question and its answer controls, shared by lesson quizzes (QuizPlayer)
 * and pre-assessments. `value` is the option ids chosen, or one string per blank.
 */
export function QuestionCard({
  question: q,
  index,
  total,
  value,
  result,
  disabled,
  onChange,
}: {
  question: LearnerQuestion;
  index: number;
  total: number;
  value: string[] | undefined;
  result?: QuestionResult;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  function toggle(optionId: string) {
    if (q.type !== "MULTIPLE") return onChange([optionId]);
    const current = value ?? [];
    onChange(current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId]);
  }

  function setBlank(i: number, text: string) {
    const current = [...(value ?? Array.from({ length: blankCount(q) }, () => ""))];
    current[i] = text;
    onChange(current);
  }

  return (
    <fieldset className="card p-6">
      <legend className="sr-only">Question {index + 1}</legend>
      <div className="text-xs font-medium text-ink-500">
        Question {index + 1} of {total}
      </div>
      <div className="mt-2 flex items-start gap-3">
        <p className="flex-1 text-[15px] font-medium leading-relaxed text-ink-950">
          {q.type === "FILL_BLANK" ? "Fill in the blanks" : q.prompt}
        </p>
        {result &&
          (result.correct ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="size-5 shrink-0 text-accent-500" />
          ))}
      </div>
      {q.type === "MULTIPLE" && <p className="mt-1 text-xs text-ink-500">Select all that apply</p>}
      {q.type === "FILL_BLANK" ? (
        <FillBlanks question={q} values={value ?? []} result={result} disabled={disabled} onChange={setBlank} />
      ) : (
        <div className="mt-4 space-y-2">
          {q.options.map((o, oi) => {
            const chosen = value?.includes(o.id) ?? false;
            const isCorrect = result?.correctOptionIds?.includes(o.id);
            return (
              <label
                key={o.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm text-ink-800 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-300",
                  chosen ? "border-primary-500 bg-primary-50/70 text-ink-950" : "border-line hover:border-ink-300 hover:bg-canvas",
                  isCorrect && "border-emerald-500 bg-emerald-50/70",
                  disabled && "cursor-default"
                )}
              >
                <input
                  type={q.type === "MULTIPLE" ? "checkbox" : "radio"}
                  name={q.id}
                  checked={chosen}
                  disabled={disabled}
                  onChange={() => toggle(o.id)}
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
}

export const blankCount = (q: LearnerQuestion) => Math.max(0, (q.segments?.length ?? 1) - 1);

export function isAnswered(q: LearnerQuestion, given: string[] | undefined) {
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
