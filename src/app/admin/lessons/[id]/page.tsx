import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Eye, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { listQuizSources } from "@/lib/lms/quiz-generator";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { ActionForm, DeleteButton, Field, Input, MoveButtons, Panel, Select, Switch, Textarea } from "@/components/admin/forms";
import { UploadField } from "@/components/admin/UploadField";
import { QuestionEditor, type EditableQuestion } from "@/components/admin/QuestionEditor";
import { QuizGenerator } from "@/components/admin/QuizGenerator";
import { Breadcrumbs, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDuration } from "@/components/learn/CourseOutline";
import { buttonClass } from "@/components/ui/Button";
import { deleteLesson, moveItem, updateLesson } from "../../actions";
import { deleteQuestion, updateQuizSettings } from "./actions";

// Unpacking a large SCORM package runs inside this page's server action.
export const maxDuration = 300;

export default async function LessonEditorPage({ params }: PageProps<"/admin/lessons/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      asset: true,
      quiz: { include: { questions: { orderBy: [{ order: "asc" }, { id: "asc" }] } } },
      module: { include: { course: { include: { program: { select: { id: true, slug: true, title: true } } } } } },
    },
  });
  if (!lesson) notFound();
  const course = lesson.module.course;
  const isMedia = lesson.type === "VIDEO" || lesson.type === "AUDIO";
  const questions = lesson.quiz?.questions ?? [];
  const contentStatus =
    lesson.type === "QUIZ" ? (questions.length ? "READY" : "EMPTY") : (lesson.asset?.status ?? "EMPTY");
  const duration = formatDuration(lesson.durationSec);
  const quizSources = lesson.type === "QUIZ" ? await listQuizSources(lesson.id) : null;
  const isExam = lesson.quiz?.kind === "EXAM";
  const typeLabel = isExam ? "Final assessment" : LESSON_TYPE_LABEL[lesson.type];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: course.program.title, href: `/admin/programs/${course.program.id}` },
          { label: course.title, href: `/admin/courses/${course.id}` },
          { label: lesson.title },
        ]}
      />

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <LessonIcon type={lesson.type} className="size-3.5" /> {isExam ? typeLabel : `${typeLabel} lesson`}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lesson.title}
            <StatusBadge status={lesson.published ? "PUBLISHED" : "DRAFT"} />
          </span>
        }
        description={lesson.module.title}
        actions={
          <>
            <Link
              href={`/learn/${course.program.slug}/${course.slug}/${lesson.id}`}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <Eye className="size-4" /> Preview
            </Link>
            <DeleteButton
              onDelete={deleteLesson.bind(null, lesson.id)}
              confirmText={`Delete “${lesson.title}”? Learner progress on it will be lost.`}
              label="Delete"
            />
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {quizSources && (
            <Panel
              title="Generate with AI"
              description="Draft questions, answers and explanations from this course's lessons. You can edit every question afterwards."
            >
              <QuizGenerator
                key={quizSources.kind}
                lessonId={lesson.id}
                kind={quizSources.kind}
                sources={quizSources.sources}
                existingCount={questions.length}
              />
            </Panel>
          )}
          {lesson.type === "QUIZ" ? (
            <Panel
              title={`Questions (${questions.length})`}
              description="Learners answer every question; the score is the share of points earned."
            >
              <div className="space-y-3">
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
                      <QuestionEditor lessonId={lesson.id} question={q as unknown as EditableQuestion} />
                      <div className="mt-4 flex justify-end border-t border-line pt-3">
                        <DeleteButton
                          onDelete={deleteQuestion.bind(null, lesson.id, q.id)}
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
                    <QuestionEditor lessonId={lesson.id} />
                  </div>
                </details>
              </div>
            </Panel>
          ) : (
            <Panel title="Content" description={CONTENT_HINT[lesson.type]}>
              {isStorageConfigured() ? (
                <UploadField
                  lessonId={lesson.id}
                  kind={lesson.type}
                  asset={
                    lesson.asset && {
                      fileName: lesson.asset.fileName,
                      status: lesson.asset.status,
                      error: lesson.asset.error,
                      sizeBytes: lesson.asset.sizeBytes,
                      scormVersion: lesson.asset.scormVersion,
                    }
                  }
                />
              ) : (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  File uploads need the AWS S3 bucket connected to this Vercel project (<code>S3_BUCKET_NAME</code>,{" "}
                  <code>AWS_REGION</code>, <code>AWS_ROLE_ARN</code>).
                </p>
              )}
            </Panel>
          )}

          <Panel title="Lesson details">
            <ActionForm action={updateLesson.bind(null, lesson.id)}>
              <div className={isMedia ? undefined : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]"}>
                <Field label="Title">
                  <Input name="title" required defaultValue={lesson.title} />
                </Field>
                {!isMedia && (
                  <Field label="Duration (minutes)" optional>
                    <Input
                      name="durationMin"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={lesson.durationSec ? Math.round(lesson.durationSec / 60) : ""}
                    />
                  </Field>
                )}
              </div>
              <Field label="Notes for learners" hint="Shown under the lesson." optional>
                <Textarea name="description" rows={4} defaultValue={lesson.description} />
              </Field>
              <Field
                label="Tutor notes"
                hint="Extra material for the AI tutor; learners don't see it. Paste a transcript or key points, especially for video and audio lessons."
                optional
              >
                <Textarea name="tutorNotes" rows={6} defaultValue={lesson.tutorNotes} />
              </Field>
              <Switch
                name="published"
                label="Visible to learners"
                description="Draft lessons are hidden from the course"
                defaultChecked={lesson.published}
              />
            </ActionForm>
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="At a glance">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Status</dt>
                <dd>
                  <StatusBadge status={lesson.published ? "PUBLISHED" : "DRAFT"} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Content</dt>
                <dd>
                  {lesson.type === "QUIZ" && questions.length ? (
                    <span className="font-medium text-ink-900">
                      {questions.length} {questions.length === 1 ? "question" : "questions"}
                    </span>
                  ) : (
                    <StatusBadge status={contentStatus} />
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Type</dt>
                <dd className="font-medium text-ink-900">{typeLabel}</dd>
              </div>
              {duration && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Duration</dt>
                  <dd className="font-medium text-ink-900">{duration}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Module</dt>
                <dd className="truncate font-medium text-ink-900">{lesson.module.title}</dd>
              </div>
            </dl>
          </Panel>

          {lesson.type === "QUIZ" && (
            <Panel title={isExam ? "Assessment settings" : "Quiz settings"}>
              <ActionForm action={updateQuizSettings.bind(null, lesson.id)}>
                <Field
                  label="Where it sits"
                  hint={
                    isExam
                      ? "Shown after every other lesson; learners open it once they've completed them all."
                      : "Shown where you place it in the course, after the lessons it checks."
                  }
                >
                  <Select name="kind" defaultValue={lesson.quiz?.kind ?? "QUIZ"}>
                    <option value="QUIZ">Quiz, between lessons</option>
                    <option value="EXAM">Final assessment, after all lessons</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pass mark (%)">
                    <Input name="passMark" type="number" min={0} max={100} required defaultValue={lesson.quiz?.passMark ?? 70} />
                  </Field>
                  <Field label="Max attempts" hint="Empty = unlimited">
                    <Input name="maxAttempts" type="number" min={1} max={100} defaultValue={lesson.quiz?.maxAttempts ?? ""} />
                  </Field>
                </div>
                <Switch name="shuffle" label="Shuffle" description="Mix up question and option order" defaultChecked={lesson.quiz?.shuffle} />
              </ActionForm>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

const QUESTION_TYPE = { SINGLE: "Single answer", MULTIPLE: "Multiple answers", TRUE_FALSE: "True / False" } as const;

const CONTENT_HINT = {
  VIDEO: "The video learners watch. Its length is read automatically.",
  AUDIO: "The recording learners listen to.",
  SCORM: "A SCORM package; progress and completion are reported by the package.",
  HTML: "A web page; learners mark it complete when they're done.",
} as const;
