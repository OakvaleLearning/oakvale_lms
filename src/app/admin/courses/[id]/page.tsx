import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Eye } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { StatusBadge, PageHeader } from "@/components/dashboard/ui";
import { LESSON_TYPE_LABEL, LessonIcon } from "@/components/learn/LessonIcon";
import {
  ActionForm,
  Checkbox,
  DeleteButton,
  Field,
  Input,
  MoveButtons,
  Panel,
  Select,
  Textarea,
  TitleSlugFields,
} from "@/components/admin/forms";
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
            include: { asset: { select: { status: true } }, quiz: { select: { _count: { select: { questions: true } } } } },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const siblings = await prisma.course.findMany({
    where: { programId: course.programId, id: { not: course.id } },
    orderBy: { order: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/programs/${course.program.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft className="size-4" /> {course.program.title}
        </Link>
        <Link
          href={`/learn/${course.program.slug}/${course.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600"
        >
          <Eye className="size-4" /> Preview as learner
        </Link>
      </div>

      <PageHeader eyebrow={course.program.title} title={course.title} />

      <Panel title="Modules & lessons">
        <div className="space-y-4">
          {course.modules.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <MoveButtons onMove={moveItem.bind(null, "module", m.id)} />
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer list-none font-semibold text-ink-900">{m.title}</summary>
                  <ActionForm action={renameModule.bind(null, m.id)} submitLabel="Rename" className="mt-3 mb-2">
                    <Input name="title" defaultValue={m.title} required />
                  </ActionForm>
                </details>
                <DeleteButton
                  onDelete={deleteModule.bind(null, m.id)}
                  confirmText={`Delete “${m.title}” and all of its lessons?`}
                />
              </div>
              <ul className="divide-y divide-line/70">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
                    <MoveButtons onMove={moveItem.bind(null, "lesson", l.id)} />
                    <Link
                      href={`/admin/lessons/${l.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50"
                    >
                      <LessonIcon type={l.type} className="shrink-0 text-ink-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{l.title}</span>
                      <span className="hidden text-xs text-ink-400 sm:inline">{LESSON_TYPE_LABEL[l.type]}</span>
                      <LessonState lesson={l} />
                      <ChevronRight className="size-4 shrink-0 text-ink-300" />
                    </Link>
                  </li>
                ))}
              </ul>
              <details className="border-t border-line px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-primary-600">Add lesson</summary>
                <ActionForm action={createLesson.bind(null, m.id)} submitLabel="Add lesson" className="mt-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                    <Input name="title" placeholder="Lesson title" required />
                    <Select name="type" defaultValue="VIDEO">
                      {Object.entries(LESSON_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </ActionForm>
              </details>
            </div>
          ))}

          <ActionForm action={createModule.bind(null, course.id)} submitLabel="Add module" resetOnSuccess>
            <Input name="title" placeholder="New module title, e.g. Module 2: Personal care" required />
          </ActionForm>
        </div>
      </Panel>

      <Panel
        title="Course settings"
        actions={
          <DeleteButton
            onDelete={deleteCourse.bind(null, course.id)}
            confirmText={`Delete “${course.title}” and all of its content? This cannot be undone.`}
            label="Delete"
          />
        }
      >
        <ActionForm action={updateCourse.bind(null, course.id)}>
          <TitleSlugFields defaultTitle={course.title} defaultSlug={course.slug} />
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={course.description} />
          </Field>
          <Field label="Cover image URL" hint="Optional">
            <Input name="coverImage" type="url" defaultValue={course.coverImage ?? ""} />
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
          <Checkbox name="published" label="Published" defaultChecked={course.published} />
          <Checkbox
            name="sequential"
            label="Lessons unlock in order (each one after the previous is completed)"
            defaultChecked={course.sequential}
          />
        </ActionForm>
      </Panel>
    </div>
  );
}

function LessonState({
  lesson,
}: {
  lesson: { type: string; published: boolean; asset: { status: string } | null; quiz: { _count: { questions: number } } | null };
}) {
  if (!lesson.published) return <StatusBadge status="DRAFT" />;
  if (lesson.type === "QUIZ") {
    const n = lesson.quiz?._count.questions ?? 0;
    return n ? <span className="text-xs text-ink-400">{n} questions</span> : <StatusBadge status="EMPTY" />;
  }
  return <StatusBadge status={lesson.asset?.status ?? "EMPTY"} />;
}
