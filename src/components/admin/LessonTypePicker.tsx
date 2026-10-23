"use client";

import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";

const START = [
  { value: "MIXED", hint: "Combine videos, documents, text and a quiz in any order. Most lessons start here." },
  { value: "VIDEO", hint: "Starts with a video" },
  { value: "AUDIO", hint: "Starts with a recording" },
  { value: "DOCUMENT", hint: "Starts with a PDF or Office file" },
  { value: "TEXT", hint: "Starts with written content" },
  { value: "SCORM", hint: "A package from an authoring tool" },
  { value: "HTML", hint: "A web page or .zip of one" },
  { value: "QUIZ", hint: "Checks the lessons before it" },
  { value: "EXAM", hint: "Final assessment, after all lessons" },
] as const;

type Start = (typeof START)[number]["value"];

const LABEL: Record<Start, string> = {
  ...LESSON_TYPE_LABEL,
  MIXED: "Multi-part lesson",
  EXAM: "Final assessment",
};

function Option({ value, hint, defaultChecked }: { value: Start; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3 transition-colors hover:border-ink-300 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-100">
      <input type="radio" name="type" value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 peer-checked:bg-primary-600 peer-checked:text-white">
        <LessonIcon type={value === "EXAM" ? "QUIZ" : value} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{LABEL[value]}</span>
        <span className="block text-xs leading-relaxed text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

/** Radio cards for what a new lesson starts with; posts `type`. You can add more parts afterwards. */
export function LessonTypePicker({ defaultValue = "MIXED" }: { defaultValue?: Start }) {
  const [first, ...rest] = START;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-ink-800">Start with</legend>
      <Option {...first} defaultChecked={first.value === defaultValue} />
      <p className="pt-1 text-xs text-ink-500">Or begin with one kind of content. You can add more parts later.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {rest.map((o) => (
          <Option key={o.value} {...o} defaultChecked={o.value === defaultValue} />
        ))}
      </div>
    </fieldset>
  );
}
