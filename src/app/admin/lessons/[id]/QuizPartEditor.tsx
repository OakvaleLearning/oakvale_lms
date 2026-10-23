import { ChevronDown, Plus, Settings2, Sparkles } from "lucide-react";
import { ActionForm, DeleteButton, Field, Input, MoveButtons, Select, Switch } from "@/components/admin/forms";
import { QuestionEditor, type EditableQuestion } from "@/components/admin/QuestionEditor";
import { QuizGenerator } from "@/components/admin/QuizGenerator";
import type { SourceLesson } from "@/lib/lms/quiz-generator";
import { moveItem } from "../../actions";
import { deleteQuestion, updateQuizSettings } from "./actions";

const QUESTION_TYPE: Record<EditableQuestion["type"], string> = { SINGLE: "Single answer", MULTIPLE: "Multiple answers", TRUE_FALSE: "True / False" } as const;

/** The editor inside a quiz part: settings, AI drafting, and the questions. */
export function QuizPartEditor({
  lessonId,
  questions,
  settings,
  sources,
  canBeExam,
}: {
  lessonId: string;
  questions: EditableQuestion[];
  settings: { kind: "QUIZ" | "EXAM"; passMark: number; maxAttempts: number | null; shuffle: boolean };
  sources: { kind: "QUIZ" | "EXAM"; sources: SourceLesson[] } | null;
  /** Only a lesson made of just this quiz can be the course's final assessment. */
  canBeExam: boolean;
}) {
  const isExam = settings.kind === "EXAM";
  return (
    <div className="space-y-4">
      <details className="group rounded-xl border border-line bg-white" open={questions.length === 0 && Boolean(sources)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
          <Sparkles className="size-4 text-primary-600" /> Draft questions with AI
          <ChevronDown className="ml-auto size-4 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-4 sm:p-5">
          <p className="mb-4 text-xs text-ink-500">
            Drafts questions, answers and explanations from this course&apos;s lessons. You can edit every question afterwards.
          </p>
          {sources ? (
            <QuizGenerator
              key={sources.kind}
              lessonId={lessonId}
              kind={sources.kind}
              sources={sources.sources}
              existingCount={questions.length}
            />
          ) : null}
        </div>
      </details>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-ink-900">Questions ({questions.length})</h3>
          <span className="text-xs text-ink-500">Learners answer every question; the score is the share of points earned.</span>
        </div>
        {questions.map((q, i) => (
          <details key={q.id} className="group rounded-xl border border-line bg-white open:shadow-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-2 pl-2 pr-3 [&::-webkit-details-marker]:hidden">
              <MoveButtons onMove={moveItem.bind(null, "question", q.id)} />
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-50 text-xs font-semibold text-primary-700">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{q.prompt}</span>
              <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">{QUESTION_TYPE[q.type]}</span>
              <ChevronDown className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line p-4 sm:p-5">
              <QuestionEditor lessonId={lessonId} question={q} />
              <div className="mt-4 flex justify-end border-t border-line pt-3">
                <DeleteButton
                  onDelete={deleteQuestion.bind(null, lessonId, q.id)}
                  confirmText="Delete this question?"
                  label="Delete question"
                />
              </div>
            </div>
          </details>
        ))}
        <details
          className="group rounded-xl border border-dashed border-ink-200 bg-canvas/50 open:border-solid open:bg-white"
          open={questions.length === 0}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-primary-700 [&::-webkit-details-marker]:hidden">
            <Plus className="size-4" /> Add a question
          </summary>
          <div className="border-t border-line p-4 sm:p-5">
            <QuestionEditor lessonId={lessonId} />
          </div>
        </details>
      </div>

      <details className="group rounded-xl border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
          <Settings2 className="size-4 text-ink-500" /> {isExam ? "Assessment settings" : "Quiz settings"}
          <span className="ml-2 hidden text-xs font-normal text-ink-500 sm:inline">
            Pass mark {settings.passMark}%{settings.maxAttempts ? ` · ${settings.maxAttempts} attempts` : ""}
          </span>
          <ChevronDown className="ml-auto size-4 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-4 sm:p-5">
          <ActionForm action={updateQuizSettings.bind(null, lessonId)}>
            {canBeExam ? (
              <Field
                label="Where it sits"
                hint={
                  isExam
                    ? "Shown after every other lesson; learners open it once they've completed them all."
                    : "Shown where you place it in the course, after the lessons it checks."
                }
              >
                <Select name="kind" defaultValue={settings.kind}>
                  <option value="QUIZ">Quiz, between lessons</option>
                  <option value="EXAM">Final assessment, after all lessons</option>
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="kind" value="QUIZ" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pass mark (%)">
                <Input name="passMark" type="number" min={0} max={100} required defaultValue={settings.passMark} />
              </Field>
              <Field label="Max attempts" hint="Empty = unlimited">
                <Input name="maxAttempts" type="number" min={1} max={100} defaultValue={settings.maxAttempts ?? ""} />
              </Field>
            </div>
            <Switch name="shuffle" label="Shuffle" description="Mix up question and option order" defaultChecked={settings.shuffle} />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
