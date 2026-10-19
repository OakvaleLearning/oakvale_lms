import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { ActionForm, Checkbox, DeleteButton, Field, Input, MoveButtons, Panel, Textarea } from "@/components/admin/forms";
import { UploadField } from "@/components/admin/UploadField";
import { QuestionEditor, type EditableQuestion } from "@/components/admin/QuestionEditor";
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
      module: { include: { course: { include: { program: { select: { slug: true } } } } } },
    },
  });
  if (!lesson) notFound();
  const course = lesson.module.course;
  const isMedia = lesson.type === "VIDEO" || lesson.type === "AUDIO";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/admin/courses/${course.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-primary-600">
          <ArrowLeft className="size-4" /> {course.title}
        </Link>
        <Link
          href={`/learn/${course.program.slug}/${course.slug}/${lesson.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600"
        >
          <Eye className="size-4" /> Preview
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm text-ink-500">
        <LessonIcon type={lesson.type} /> {LESSON_TYPE_LABEL[lesson.type]} lesson · {lesson.module.title}
      </div>

      {lesson.type === "QUIZ" ? (
        <>
          <Panel title="Quiz settings">
            <ActionForm action={updateQuizSettings.bind(null, lesson.id)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pass mark (%)">
                  <Input name="passMark" type="number" min={0} max={100} required defaultValue={lesson.quiz?.passMark ?? 70} />
                </Field>
                <Field label="Maximum attempts" hint="Leave empty for unlimited">
                  <Input name="maxAttempts" type="number" min={1} max={100} defaultValue={lesson.quiz?.maxAttempts ?? ""} />
                </Field>
              </div>
              <Checkbox name="shuffle" label="Shuffle questions and options" defaultChecked={lesson.quiz?.shuffle} />
            </ActionForm>
          </Panel>

          <Panel title={`Questions (${lesson.quiz?.questions.length ?? 0})`}>
            <div className="space-y-3">
              {lesson.quiz?.questions.map((q, i) => (
                <details key={q.id} className="rounded-2xl border border-ink-100">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
                    <MoveButtons onMove={moveItem.bind(null, "question", q.id)} />
                    <span className="text-sm font-bold text-primary-600">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{q.prompt}</span>
                    <DeleteButton onDelete={deleteQuestion.bind(null, lesson.id, q.id)} confirmText="Delete this question?" />
                  </summary>
                  <div className="border-t border-ink-100 p-4">
                    <QuestionEditor lessonId={lesson.id} question={q as unknown as EditableQuestion} />
                  </div>
                </details>
              ))}
              <details className="rounded-2xl border border-dashed border-ink-200 p-4" open={!lesson.quiz?.questions.length}>
                <summary className="cursor-pointer text-sm font-semibold text-primary-600">Add a question</summary>
                <div className="mt-4">
                  <QuestionEditor lessonId={lesson.id} />
                </div>
              </details>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title="Content">
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
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              File uploads need Cloudflare R2. Set <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>,{" "}
              <code>R2_SECRET_ACCESS_KEY</code> and <code>R2_BUCKET</code>.
            </p>
          )}
        </Panel>
      )}

      <Panel
        title="Lesson details"
        actions={
          <DeleteButton
            onDelete={deleteLesson.bind(null, lesson.id)}
            confirmText={`Delete “${lesson.title}”? Learner progress on it will be lost.`}
            label="Delete"
          />
        }
      >
        <ActionForm action={updateLesson.bind(null, lesson.id)}>
          <Field label="Title">
            <Input name="title" required defaultValue={lesson.title} />
          </Field>
          <Field label="Notes for learners" hint="Shown under the lesson. Optional.">
            <Textarea name="description" rows={4} defaultValue={lesson.description} />
          </Field>
          {!isMedia && (
            <Field label="Estimated duration (minutes)" hint="Optional">
              <Input
                name="durationMin"
                type="number"
                min={0}
                step={1}
                defaultValue={lesson.durationSec ? Math.round(lesson.durationSec / 60) : ""}
              />
            </Field>
          )}
          <Checkbox name="published" label="Visible to learners" defaultChecked={lesson.published} />
        </ActionForm>
      </Panel>
    </div>
  );
}
