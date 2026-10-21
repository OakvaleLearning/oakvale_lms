"use client";

import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";

const TYPES = [
  { value: "VIDEO", hint: "Upload an MP4 or other video" },
  { value: "AUDIO", hint: "A podcast-style recording" },
  { value: "SCORM", hint: "A package from an authoring tool" },
  { value: "HTML", hint: "A web page or .zip of one" },
  { value: "QUIZ", hint: "Checks the lessons before it" },
  { value: "EXAM", hint: "Final assessment, after all lessons" },
] as const;

const LABEL = { ...LESSON_TYPE_LABEL, EXAM: "Final assessment" };

/** Radio cards for choosing a new lesson's type; posts `type`. */
export function LessonTypePicker({ defaultValue = "VIDEO" }: { defaultValue?: (typeof TYPES)[number]["value"] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-800">Lesson type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TYPES.map((t) => (
          <label
            key={t.value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3 transition-colors hover:border-ink-300 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-100"
          >
            <input type="radio" name="type" value={t.value} defaultChecked={t.value === defaultValue} className="peer sr-only" />
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 peer-checked:bg-primary-600 peer-checked:text-white">
              <LessonIcon type={t.value === "EXAM" ? "QUIZ" : t.value} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-900">{LABEL[t.value]}</span>
              <span className="block text-xs leading-relaxed text-ink-500">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
