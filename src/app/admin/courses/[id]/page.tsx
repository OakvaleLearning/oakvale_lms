import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Eye, FolderPlus, Layers, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Breadcrumbs, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import { formatDuration } from "@/components/learn/CourseOutline";
import { CoverImageField } from "@/components/admin/CoverImageField";
import { LessonTypePicker } from "@/components/admin/LessonTypePicker";
import { lessonReadiness } from "@/lib/lms/readiness";
import { buttonClass } from "@/components/ui/Button";
import {
  ActionForm,
  DeleteButton,
  Dialog,
  Field,
  InlineRename,
  Input,
  MoveButtons,
  Panel,
  Select,
  Switch,
  Textarea,
  TitleField,
} from "@/components/admin/forms";
import { cardControlsClass, cardListClass, cardRowClass } from "@/components/admin/cardList";
import { IssueEligibleButton } from "@/components/admin/IssueEligibleButton";
import { updateCourseCertificate } from "../../certificates/actions";
import {
  createLesson,
  createModule,
  deleteCourse,
  deleteModule,
  moveItem,
  renameModule,
  updateCourse,
} from "../../actions";

export default async function CourseBuilderPage({ params }: PageProps<"/admin/courses/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      program: { select: { id: true, slug: true, title: true } },
      modules: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          lessons: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            include: {
              blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { type: true, body: true, asset: { select: { status: true } } } },
              quiz: { select: { kind: true, _count: { select: { questions: true } } } },
            },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const [siblings, templates, issuedCount] = await Promise.all([
    prisma.course.findMany({
      where: { programId: course.programId, id: { not: course.id } },
      orderBy: { order: "asc" },
      select: { id: true, title: true },
    }),
    prisma.certificateTemplate.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true },
    }),
    prisma.certificate.count({ where: { courseId: course.id } }),
  ]);

  const lessons = course.modules.flatMap((m) => m.lessons);
  const published = lessons.filter((l) => l.published).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Programmes", href: "/admin/programs" },
          { label: course.program.title, href: `/admin/programs/${course.program.id}` },
          { label: course.title },
        ]}
      />

      <PageHeader
        eyebrow="Course"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {course.title}
            <StatusBadge status={course.published ? "PUBLISHED" : "DRAFT"} />
          </span>
        }
        description={`${course.modules.length} ${course.modules.length === 1 ? "module" : "modules"} · ${lessons.length} ${
          lessons.length === 1 ? "lesson" : "lessons"
        } · ${published} visible to learners`}
        actions={
          <>
            <Link href={`/learn/${course.program.slug}/${course.slug}`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Eye className="size-4" /> Preview as learner
            </Link>
            <DeleteButton
              onDelete={deleteCourse.bind(null, course.id)}
              confirmText={`Delete “${course.title}” and all of its content? This cannot be undone.`}
              label="Delete"
            />
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4" aria-label="Curriculum">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-950">Curriculum</h2>
              <p className="mt-0.5 text-xs text-ink-500">Modules group lessons. Use the arrows to reorder.</p>
            </div>
          </div>

          {course.modules.length === 0 && (
            <div className="card px-6 py-12 text-center">
              <Layers className="mx-auto size-6 text-ink-300" />
              <p className="mt-3 text-sm font-medium text-ink-900">Start with a module</p>
              <p className="mt-1 text-sm text-ink-500">e.g. “Module 1: Getting started”, then add lessons to it.</p>
            </div>
          )}

          {course.modules.map((m, mi) => (
            <article key={m.id} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-line bg-canvas/50 py-2 pl-2 pr-3">
                <MoveButtons onMove={moveItem.bind(null, "module", m.id)} />
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-600 text-xs font-semibold text-white">
                  {mi + 1}
                </span>
                <InlineRename
                  action={renameModule.bind(null, m.id)}
                  defaultValue={m.title}
                  className="flex-1 text-sm font-semibold text-ink-950"
                />
                <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">
                  {m.lessons.length} {m.lessons.length === 1 ? "lesson" : "lessons"}
                </span>
                <DeleteButton onDelete={deleteModule.bind(null, m.id)} confirmText={`Delete “${m.title}” and all of its lessons?`} />
              </header>

              {m.lessons.length > 0 ? (
                <ul className={cardListClass}>
                  {m.lessons.map((l) => {
                    const duration = formatDuration(l.durationSec);
                    return (
                      <li key={l.id} className={cardRowClass}>
                        <div className={cardControlsClass}>
                          <MoveButtons onMove={moveItem.bind(null, "lesson", l.id)} />
                          <span className="pr-1.5 sm:hidden">
                            <LessonState lesson={l} />
                          </span>
                        </div>
                        <Link
                          href={`/admin/lessons/${l.id}`}
                          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 transition-colors hover:bg-canvas sm:px-2 sm:py-2"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 group-hover:bg-white">
                            <LessonIcon type={l.type} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink-900 sm:truncate">{l.title}</span>
                            <span className="block text-xs text-ink-500">
                              {l.quiz?.kind === "EXAM"
                                ? "Final assessment · shown after all lessons"
                                : l.type === "MIXED" && l.blocks.length > 0
                                  ? `Multi-part · ${l.blocks.length} ${l.blocks.length === 1 ? "part" : "parts"}`
                                  : LESSON_TYPE_LABEL[l.type]}
                              {duration && ` · ${duration}`}
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            <LessonState lesson={l} />
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-5 text-sm text-ink-500">No lessons in this module yet.</p>
              )}

              <footer className="border-t border-line px-3 py-2">
                <Dialog
                  title="Add a lesson"
                  description={`To “${m.title}”. You'll add its content next.`}
                  triggerVariant="ghost"
                  trigger={
                    <>
                      <Plus className="size-4" /> Add lesson
                    </>
                  }
                >
                  <ActionForm action={createLesson.bind(null, m.id)} submitLabel="Create lesson" footerClassName="justify-end">
                    <Field label="Lesson title">
                      <Input name="title" required placeholder="e.g. Washing hands properly" />
                    </Field>
                    <LessonTypePicker />
                  </ActionForm>
                </Dialog>
              </footer>
            </article>
          ))}

          <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-800">
              <FolderPlus className="size-4 text-ink-400" /> Add a module
            </div>
            <ActionForm
              action={createModule.bind(null, course.id)}
              submitLabel="Add module"
              resetOnSuccess
              className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start"
            >
              <div className="flex-1">
                <Input name="title" placeholder={`e.g. Module ${course.modules.length + 1}: Personal care`} required />
              </div>
            </ActionForm>
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="Course settings">
            <ActionForm action={updateCourse.bind(null, course.id)}>
              <TitleField defaultTitle={course.title} />
              <Field label="Description" optional>
                <Textarea name="description" rows={4} defaultValue={course.description} />
              </Field>
              <Field label="Prerequisite" hint="Learners must complete this course first">
                <Select name="prerequisiteId" defaultValue={course.prerequisiteId ?? ""}>
                  <option value="">None</option>
                  {siblings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="space-y-2">
                <Switch name="published" label="Published" description="Visible to enrolled learners" defaultChecked={course.published} />
                <Switch
                  name="sequential"
                  label="Unlock lessons in order"
                  description="Each lesson opens after the previous one is completed"
                  defaultChecked={course.sequential}
                />
              </div>
            </ActionForm>
          </Panel>
          <Panel
            title="Certificate"
            description={`${issuedCount} issued`}
            actions={
              <Link href="/admin/certificates?tab=templates" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                Templates
              </Link>
            }
          >
            <ActionForm action={updateCourseCertificate.bind(null, course.id)}>
              <Switch
                name="certificateEnabled"
                label="Issue a certificate"
                description="When every lesson is complete and the quiz and assessment average reaches the pass mark"
                defaultChecked={course.certificateEnabled}
              />
              <Field label="Pass mark" hint="Average of the learner's best score on each quiz and final assessment in this course">
                <span className="flex items-center gap-2">
                  <Input
                    name="certificatePassMark"
                    type="number"
                    min={0}
                    max={100}
                    required
                    defaultValue={course.certificatePassMark}
                    className="w-24"
                  />
                  <span className="text-sm text-ink-500">%</span>
                </span>
              </Field>
              <Field label="Template">
                <Select name="certificateTemplateId" defaultValue={course.certificateTemplateId ?? ""}>
                  <option value="">Default template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="space-y-4 border-t border-line pt-5">
                <Switch
                  name="cpdEnabled"
                  label="Includes a CPD certificate"
                  description="Sent to the learner directly by the issuing body"
                  defaultChecked={course.cpdEnabled}
                />
                <Field label="CPD issuing body" hint="Shown to learners, e.g. The CPD Certification Service">
                  <Input name="cpdProvider" defaultValue={course.cpdProvider} maxLength={120} />
                </Field>
                <Field label="CPD hours" optional>
                  <Input name="cpdHours" type="number" min={1} max={1000} defaultValue={course.cpdHours ?? ""} className="w-24" />
                </Field>
              </div>
            </ActionForm>
            <div className="mt-5 border-t border-line pt-5">
              <IssueEligibleButton courseId={course.id} />
            </div>
          </Panel>
          <Panel title="Cover image">
            <CoverImageField target={{ kind: "course", id: course.id }} current={course.coverImage} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function LessonState({
  lesson,
}: {
  lesson: {
    published: boolean;
    blocks: { type: string; body: string; asset: { status: string } | null }[];
    quiz: { _count: { questions: number } } | null;
  };
}) {
  if (!lesson.published) return <StatusBadge status="DRAFT" />;
  const questions = lesson.quiz?._count.questions ?? 0;
  const { total, ready, problem } = lessonReadiness(lesson.blocks, questions);
  if (total === 0) return <StatusBadge status="EMPTY" />;
  if (problem === "FAILED" || problem === "PROCESSING" || problem === "UPLOADING") return <StatusBadge status={problem} />;
  if (problem) {
    return (
      <span className="text-xs text-amber-700">
        {ready} of {total} {total === 1 ? "part" : "parts"} ready
      </span>
    );
  }
  // Everything is ready: say what's in it.
  if (total === 1 && lesson.blocks[0].type === "QUIZ") {
    return (
      <span className="text-xs text-ink-500">
        {questions} {questions === 1 ? "question" : "questions"}
      </span>
    );
  }
  return total === 1 ? <StatusBadge status="READY" /> : <span className="text-xs text-ink-500">{total} parts ready</span>;
}
