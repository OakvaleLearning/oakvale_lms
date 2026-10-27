"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { FormError } from "@/components/ui/TextField";
import { cn } from "@/lib/utils";
import { generateQuestions } from "@/app/admin/lessons/[id]/actions";
import type { Difficulty, QuestionKind, QuizKind, SourceLesson } from "@/lib/lms/quiz-generator";
import { CheckCard, Field, Input, Switch } from "./forms";

const COUNTS = [5, 10, 15, 20];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", mixed: "Mixed", challenging: "Challenging" };
const TYPE_LABEL: Record<QuestionKind, string> = {
  SINGLE: "Single answer",
  MULTIPLE: "Multiple answers",
  TRUE_FALSE: "True / False",
};

export function QuizGenerator({
  lessonId,
  kind,
  sources,
  existingCount,
}: {
  lessonId: string;
  kind: QuizKind;
  sources: SourceLesson[];
  existingCount: number;
}) {
  const ids = (list: SourceLesson[]) => list.map((s) => s.id);
  const suggested = sources.filter((s) => s.suggested);
  const suggestedWithText = suggested.filter((s) => s.chars > 0);
  const [selected, setSelected] = useState<string[]>(ids(suggestedWithText.length ? suggestedWithText : suggested));
  const [count, setCount] = useState(kind === "EXAM" ? 20 : 10);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [types, setTypes] = useState<QuestionKind[]>(["SINGLE", "TRUE_FALSE"]);
  const [focus, setFocus] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  function generate() {
    setError("");
    setCreated(0);
    if (replace && !confirming) return setConfirming(true);
    setConfirming(false);
    start(async () => {
      const res = await generateQuestions(lessonId, { sourceLessonIds: selected, count, types, difficulty, focus, replace });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated(res.created);
      setReplace(false);
    });
  }

  if (sources.length === 0) {
    return (
      <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">
        Add some lessons to this course first. The AI writes questions from their content.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <legend className="text-sm font-medium text-ink-800">Base questions on</legend>
          <div className="flex gap-3 text-xs font-medium text-primary-600">
            {kind === "QUIZ" && suggested.length < sources.length && (
              <button type="button" onClick={() => setSelected(ids(suggested))} className="hover:text-primary-700">
                Lessons before this quiz
              </button>
            )}
            <button type="button" onClick={() => setSelected(ids(sources))} className="hover:text-primary-700">
              Whole course
            </button>
            <button type="button" onClick={() => setSelected([])} className="hover:text-primary-700">
              Clear
            </button>
          </div>
        </div>
        <p className="mb-2.5 text-xs leading-relaxed text-ink-500">
          {kind === "EXAM"
            ? "A final assessment covers the whole course, so every lesson is selected."
            : "A quiz checks the lessons just before it, so those are selected. Make this a final assessment in Quiz settings to cover the whole course."}{" "}
          The AI reads each lesson&apos;s uploaded content, notes for learners and tutor notes.
        </p>
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {sources.map((s) => (
            <CheckCard
              key={s.id}
              label={s.title}
              hint={s.chars > 0 ? s.moduleTitle : `${s.moduleTitle} · no text found, add tutor notes`}
              checked={selected.includes(s.id)}
              onChange={() => setSelected((all) => toggle(all, s.id))}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Segmented
          label="Number of questions"
          options={COUNTS.map((n) => ({ value: n, label: String(n) }))}
          value={count}
          onChange={setCount}
        />
        <Segmented
          label="Difficulty"
          options={(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
          value={difficulty}
          onChange={setDifficulty}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">Question types</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(TYPE_LABEL) as QuestionKind[]).map((t) => (
            <CheckCard key={t} label={TYPE_LABEL[t]} checked={types.includes(t)} onChange={() => setTypes((all) => toggle(all, t))} />
          ))}
        </div>
      </fieldset>

      <Field label="Focus on" hint="e.g. infection control, or the steps for responding to choking" optional>
        <Input value={focus} maxLength={500} onChange={(e) => setFocus(e.target.value)} />
      </Field>

      {existingCount > 0 && (
        <Switch
          label={`Replace the ${existingCount} existing ${existingCount === 1 ? "question" : "questions"}`}
          description="Off: new questions are added after the current ones"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
      )}

      {error && <FormError>{error}</FormError>}

      {confirming ? (
        <InlineConfirm
          message={`Replace all ${existingCount} existing questions with new AI questions?`}
          confirmLabel="Replace questions"
          onCancel={() => setConfirming(false)}
          onConfirm={generate}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={generate} disabled={pending || selected.length === 0 || types.length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending ? "Writing questions…" : `Generate ${count} questions`}
          </Button>
          {pending && <span className="text-sm text-ink-500">This can take up to a minute.</span>}
          {created > 0 && !pending && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <Check className="size-4" /> Added {created} {created === 1 ? "question" : "questions"}. Check them below before
              learners see this quiz.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-ink-100 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
              value === o.value ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
