import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import type { ContentAsset, LessonBlock } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { listQuizSources } from "@/lib/lms/quiz-generator";
import { BLOCK_LABEL, isFileBlock, type BlockKind } from "@/lib/lms/blocks";
import { lessonReadiness, partStatus } from "@/lib/lms/readiness";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { ActionForm, DeleteButton, Field, Input, Panel, Switch, Textarea } from "@/components/admin/forms";
import { UploadField } from "@/components/admin/UploadField";
import { TextPartEditor } from "@/components/admin/TextPartEditor";
import { LessonBuilder, type BuilderPart } from "@/components/admin/LessonBuilder";
import type { EditableQuestion } from "@/components/admin/QuestionEditor";
import { Breadcrumbs, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { formatDuration } from "@/components/learn/CourseOutline";
import { buttonClass } from "@/components/ui/Button";
import { deleteLesson, updateLesson } from "../../actions";
import { QuizPartEditor } from "./QuizPartEditor";

// Unpacking a large SCORM package runs inside this page's server action.
export const maxDuration = 300;

export default async function LessonEditorPage({ params }: PageProps<"/admin/lessons/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { asset: true } },
      quiz: { include: { questions: { orderBy: [{ order: "asc" }, { id: "asc" }] } } },
      module: { include: { course: { include: { program: { select: { id: true, slug: true, title: true } } } } } },
    },
  });
  if (!lesson) notFound();

  const course = lesson.module.course;
  const questions = lesson.quiz?.questions ?? [];
  const isExam = lesson.quiz?.kind === "EXAM";
  const storageReady = isStorageConfigured();
  const quizSources = lesson.blocks.some((b) => b.type === "QUIZ") ? await listQuizSources(lesson.id) : null;
  const readiness = lessonReadiness(lesson.blocks, questions.length);
  const duration = formatDuration(lesson.durationSec);
  const typeLabel = isExam ? "Final assessment" : lesson.type === "MIXED" ? "Multi-part lesson" : `${LESSON_TYPE_LABEL[lesson.type]} lesson`;

  const parts: BuilderPart[] = lesson.blocks.map((block) => {
    const type = block.type as BlockKind;
    const status = partStatus(block, questions.length);
    return {
      id: block.id,
      type,
      title: block.title,
      required: block.required,
      durationMin: block.durationSec ? Math.max(1, Math.round(block.durationSec / 60)) : null,
      status,
      summary: summarize(block, questions.length, lesson.quiz?.passMark),
      editor: (
        <PartEditor
          block={block}
          lessonId={lesson.id}
          storageReady={storageReady}
          questions={questions as unknown as EditableQuestion[]}
          quiz={lesson.quiz}
          quizSources={quizSources}
          canBeExam={lesson.blocks.length === 1}
        />
      ),
    };
  });

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
            <LessonIcon type={lesson.type} className="size-3.5" /> {typeLabel}
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
              <Eye className="size-4" /> Preview as learner
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
        <section className="min-w-0" aria-label="Lesson content">
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-ink-950">Lesson content</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Learners work through these parts from top to bottom. Drag to reorder, or drop files anywhere here to add them.
            </p>
          </div>
          <LessonBuilder lessonId={lesson.id} parts={parts} locked={isExam} />
        </section>

        <aside className="space-y-6">
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
                  {readiness.total === 0 ? (
                    <StatusBadge status="EMPTY" />
                  ) : readiness.problem ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-ink-500">
                        {readiness.ready} of {readiness.total} ready
                      </span>
                      <StatusBadge status={readiness.problem} />
                    </span>
                  ) : (
                    <span className="font-medium text-ink-900">
                      {readiness.total} {readiness.total === 1 ? "part" : "parts"} ready
                    </span>
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

          <Panel title="Lesson details">
            <ActionForm action={updateLesson.bind(null, lesson.id)}>
              <Field label="Title">
                <Input name="title" required defaultValue={lesson.title} />
              </Field>
              <Field label="Notes for learners" hint="Shown under the lesson." optional>
                <Textarea name="description" rows={4} defaultValue={lesson.description} />
              </Field>
              <Field
                label="Tutor notes"
                hint="Extra material for the AI tutor; learners don't see it. Paste a transcript or key points, especially for video, audio and document parts."
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
        </aside>
      </div>
    </div>
  );
}

type Block = LessonBlock & { asset: ContentAsset | null };

/** The one-line description shown while a part is collapsed. */
function summarize(block: Block, questionCount: number, passMark?: number): string {
  if (block.type === "TEXT") {
    const plain = block.body.replace(/[#>*_`\[\]()-]+/g, " ").replace(/\s+/g, " ").trim();
    return plain ? plain.slice(0, 160) : "No text yet. Open to write it.";
  }
  if (block.type === "QUIZ") {
    return questionCount
      ? `${questionCount} ${questionCount === 1 ? "question" : "questions"}${passMark !== undefined ? ` · pass mark ${passMark}%` : ""}`
      : "No questions yet. Open to add some.";
  }
  const asset = block.asset;
  if (!asset) return `No ${BLOCK_LABEL[block.type as BlockKind].toLowerCase()} file yet. Open to upload one.`;
  if (asset.status === "FAILED") return asset.error ?? "Processing failed. Upload the file again.";
  const size = asset.sizeBytes ? ` · ${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "";
  return `${asset.fileName}${size}${asset.scormVersion ? ` · SCORM ${asset.scormVersion}` : ""}`;
}

function PartEditor({
  block,
  lessonId,
  storageReady,
  questions,
  quiz,
  quizSources,
  canBeExam,
}: {
  block: Block;
  lessonId: string;
  storageReady: boolean;
  questions: EditableQuestion[];
  quiz: { kind: "QUIZ" | "EXAM"; passMark: number; maxAttempts: number | null; shuffle: boolean } | null;
  quizSources: Awaited<ReturnType<typeof listQuizSources>> | null;
  canBeExam: boolean;
}) {
  if (block.type === "TEXT") return <TextPartEditor blockId={block.id} initial={block.body} />;

  if (block.type === "QUIZ") {
    return (
      <QuizPartEditor
        lessonId={lessonId}
        questions={questions}
        settings={quiz ?? { kind: "QUIZ", passMark: 70, maxAttempts: null, shuffle: false }}
        sources={quizSources}
        canBeExam={canBeExam}
      />
    );
  }

  if (!isFileBlock(block.type)) return null;
  if (!storageReady) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        File uploads need the AWS S3 bucket connected to this Vercel project (<code>S3_BUCKET_NAME</code>, <code>AWS_REGION</code>,{" "}
        <code>AWS_ROLE_ARN</code>).
      </p>
    );
  }
  return <UploadField blockId={block.id} kind={block.type} asset={block.asset} />;
}
