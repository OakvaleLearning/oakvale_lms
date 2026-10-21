"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { saveQuestion } from "@/app/admin/lessons/[id]/actions";
import { Field, Input, Textarea } from "./forms";

type QType = "SINGLE" | "MULTIPLE" | "TRUE_FALSE";
interface Option {
  id: string;
  text: string;
}
export interface EditableQuestion {
  id: string;
  type: QType;
  prompt: string;
  options: Option[];
  correct: string[];
  explanation: string | null;
  points: number;
}

const TYPE_LABEL: Record<QType, string> = { SINGLE: "Single answer", MULTIPLE: "Multiple answers", TRUE_FALSE: "True / False" };

const newId = () => Math.random().toString(36).slice(2, 10);
const TRUE_FALSE: Option[] = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];
const blankOptions = () => [
  { id: newId(), text: "" },
  { id: newId(), text: "" },
];

export function QuestionEditor({ lessonId, question }: { lessonId: string; question?: EditableQuestion }) {
  const [type, setType] = useState<QType>(question?.type ?? "SINGLE");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [options, setOptions] = useState<Option[]>(question?.options ?? blankOptions());
  const [correct, setCorrect] = useState<string[]>(question?.correct ?? []);
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [points, setPoints] = useState(question?.points ?? 1);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function changeType(next: QType) {
    setType(next);
    if (next === "TRUE_FALSE") {
      setOptions(TRUE_FALSE);
      setCorrect([]);
    } else if (type === "TRUE_FALSE") {
      setOptions(blankOptions());
      setCorrect([]);
    } else if (next === "SINGLE") {
      setCorrect((c) => c.slice(0, 1));
    }
  }

  function toggleCorrect(id: string) {
    setCorrect((c) => (type === "MULTIPLE" ? (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]) : [id]));
  }

  function save() {
    setError("");
    start(async () => {
      const res = await saveQuestion(lessonId, question?.id ?? null, {
        type,
        prompt,
        options,
        correct,
        explanation,
        points,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!question) {
        setPrompt("");
        setOptions(type === "TRUE_FALSE" ? TRUE_FALSE : blankOptions());
        setCorrect([]);
        setExplanation("");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-800">Question type</span>
          <div role="radiogroup" aria-label="Question type" className="inline-flex rounded-lg bg-ink-100 p-1">
            {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => changeType(t)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  type === t ? "bg-white font-medium text-ink-950 shadow-card" : "text-ink-600 hover:text-ink-900"
                )}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <label className="block w-24">
          <span className="mb-1.5 block text-sm font-medium text-ink-800">Points</span>
          <Input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      </div>
      <Field label="Question">
        <Textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-700">
          Answers{" "}
          <span className="font-normal text-ink-500">
            — mark the correct {type === "MULTIPLE" ? "answers" : "answer"}
          </span>
        </legend>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <button
                type="button"
                role={type === "MULTIPLE" ? "checkbox" : "radio"}
                aria-checked={correct.includes(o.id)}
                onClick={() => toggleCorrect(o.id)}
                className={cn(
                  "grid size-9 shrink-0 place-items-center border text-xs font-semibold transition-colors",
                  type === "MULTIPLE" ? "rounded-lg" : "rounded-full",
                  correct.includes(o.id)
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-line bg-white text-ink-500 hover:border-emerald-400 hover:text-emerald-700"
                )}
                aria-label={`Option ${i + 1} is correct`}
                title="Mark as correct"
              >
                {correct.includes(o.id) ? <Check className="size-4" /> : String.fromCharCode(65 + i)}
              </button>
              <Input
                value={o.text}
                disabled={type === "TRUE_FALSE"}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOptions((all) => all.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                className={cn(correct.includes(o.id) && "border-emerald-300 bg-emerald-50/60")}
              />
              {type !== "TRUE_FALSE" && options.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setOptions((all) => all.filter((x) => x.id !== o.id));
                    setCorrect((c) => c.filter((x) => x !== o.id));
                  }}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-100"
                  aria-label="Remove option"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {type !== "TRUE_FALSE" && options.length < 10 && (
          <button
            type="button"
            onClick={() => setOptions((all) => [...all, { id: newId(), text: "" }])}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600"
          >
            <Plus className="size-4" /> Add option
          </button>
        )}
      </fieldset>

      <Field label="Explanation" hint="Shown after the learner passes or runs out of attempts. Optional.">
        <Textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {question ? "Save question" : "Add question"}
        </Button>
        {error && <span className="text-sm text-accent-600">{error}</span>}
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
