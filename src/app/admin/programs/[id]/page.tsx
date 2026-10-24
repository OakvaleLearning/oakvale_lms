import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { Breadcrumbs, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { CoverImageField } from "@/components/admin/CoverImageField";
import { buttonClass } from "@/components/ui/Button";
import {
  ActionForm,
  CheckCard,
  DeleteButton,
  Dialog,
  Field,
  Input,
  MoveButtons,
  Panel,
  Switch,
  Textarea,
  TitleField,
} from "@/components/admin/forms";
import { cardControlsClass, cardListClass, cardRowClass } from "@/components/admin/cardList";
import {
  createCourse,
  createTier,
  deleteProgram,
  deleteTier,
  moveItem,
  updateProgram,
  updateTier,
} from "../../actions";

export default async function ProgramPage({ params }: PageProps<"/admin/programs/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      courses: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: { modules: { select: { _count: { select: { lessons: true } } } } },
      },
      tiers: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          courses: { select: { courseId: true } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });
  if (!program) notFound();

  const courseOptions = program.courses.map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Programmes", href: "/admin/programs" }, { label: program.title }]} />

      <PageHeader
        eyebrow="Programme"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {program.title}
            <StatusBadge status={program.published ? "PUBLISHED" : "DRAFT"} />
          </span>
        }
        description={`${program.courses.length} ${program.courses.length === 1 ? "course" : "courses"} · ${
          program.tiers.length
        } ${program.tiers.length === 1 ? "tier" : "tiers"}`}
        actions={
          <>
            <a href={`/enroll?track=${program.slug}`} target="_blank" className={buttonClass({ variant: "outline", size: "sm" })}>
              Enrolment page <ExternalLink className="size-3.5" />
            </a>
            <DeleteButton
              onDelete={deleteProgram.bind(null, program.id)}
              confirmText={`Delete “${program.title}” and all of its courses and content? This cannot be undone.`}
              label="Delete"
            />
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Courses"
            description="Learners see courses in this order."
            flush
            actions={
              <Dialog
                title="Add a course"
                description="You'll build its modules and lessons next."
                trigger={
                  <>
                    <Plus className="size-4" /> Add course
                  </>
                }
              >
                <ActionForm action={createCourse.bind(null, program.id)} submitLabel="Create course" footerClassName="justify-end">
                  <TitleField />
                  <Field label="Description" optional>
                    <Textarea name="description" rows={3} />
                  </Field>
                </ActionForm>
              </Dialog>
            }
          >
            {program.courses.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <BookOpen className="mx-auto size-6 text-ink-300" />
                <p className="mt-3 text-sm text-ink-500">No courses yet. Add the first one to start building.</p>
              </div>
            ) : (
              <ul className={cardListClass}>
                {program.courses.map((c) => {
                  const lessons = c.modules.reduce((n, m) => n + m._count.lessons, 0);
                  return (
                    <li key={c.id} className={cardRowClass}>
                      <div className={cardControlsClass}>
                        <MoveButtons onMove={moveItem.bind(null, "course", c.id)} />
                        <span className="pr-1.5 sm:hidden">
                          <StatusBadge status={c.published ? "PUBLISHED" : "DRAFT"} />
                        </span>
                      </div>
                      <Link
                        href={`/admin/courses/${c.id}`}
                        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 transition-colors hover:bg-canvas sm:px-2 sm:py-2.5"
                      >
                        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary-50 text-primary-400">
                          {c.coverImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- covers come from /media redirects or external URLs
                            <img src={c.coverImage} alt="" className="absolute inset-0 size-full object-cover" />
                          ) : (
                            <BookOpen className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink-950 sm:truncate">{c.title}</span>
                          <span className="block text-xs text-ink-500">
                            {c.modules.length} {c.modules.length === 1 ? "module" : "modules"} · {lessons}{" "}
                            {lessons === 1 ? "lesson" : "lessons"}
                          </span>
                        </span>
                        <span className="hidden sm:block">
                          <StatusBadge status={c.published ? "PUBLISHED" : "DRAFT"} />
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Tiers & pricing"
            description="A tier is what learners buy. Each one unlocks a set of courses."
            actions={
              <Dialog
                title="Add a tier"
                trigger={
                  <>
                    <Plus className="size-4" /> Add tier
                  </>
                }
                triggerVariant="outline"
              >
                <TierFields action={createTier.bind(null, program.id)} courses={courseOptions} submitLabel="Create tier" />
              </Dialog>
            }
          >
            {program.tiers.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">No tiers yet. Add one so learners can enrol.</p>
            ) : (
              <div className="space-y-3">
                {program.tiers.map((t) => {
                  const included = new Set(t.courses.map((c) => c.courseId));
                  return (
                    <details key={t.id} className="group rounded-xl border border-line bg-white open:shadow-card">
                      <summary className="flex cursor-pointer list-none flex-col sm:flex-row sm:items-center sm:gap-1 sm:px-3 sm:py-3 [&::-webkit-details-marker]:hidden">
                        <div className={cardControlsClass}>
                          <MoveButtons onMove={moveItem.bind(null, "tier", t.id)} />
                          <span className="pr-1.5 sm:hidden">
                            <StatusBadge status={t.published ? "PUBLISHED" : "DRAFT"} />
                          </span>
                        </div>
                        <span className="flex min-w-0 flex-1 items-center gap-3 p-3 sm:p-0 sm:pl-2">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold text-ink-950">{t.name}</span>
                              <span className="text-sm font-medium tabular-nums text-ink-700">{formatNaira(t.price)}</span>
                            </span>
                            <span className="block text-xs text-ink-500">
                              {included.size} {included.size === 1 ? "course" : "courses"} · {t._count.enrollments} active{" "}
                              {t._count.enrollments === 1 ? "learner" : "learners"}
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            <StatusBadge status={t.published ? "PUBLISHED" : "DRAFT"} />
                          </span>
                          <ChevronDown className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="border-t border-line p-4 sm:p-5">
                        <TierFields action={updateTier.bind(null, t.id)} courses={courseOptions} tier={{ ...t, included }} />
                        <div className="mt-4 flex justify-end border-t border-line pt-3">
                          <DeleteButton
                            onDelete={deleteTier.bind(null, t.id)}
                            confirmText={`Delete the “${t.name}” tier?`}
                            label="Delete tier"
                          />
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <Panel title="Programme details">
            <ActionForm action={updateProgram.bind(null, program.id)}>
              <TitleField defaultTitle={program.title} />
              <Field label="Description" optional>
                <Textarea name="description" rows={4} defaultValue={program.description} />
              </Field>
              <Switch
                name="published"
                label="Published"
                description="Visible on the enrolment page"
                defaultChecked={program.published}
              />
            </ActionForm>
          </Panel>
          <Panel title="Cover image">
            <CoverImageField target={{ kind: "program", id: program.id }} current={program.coverImage} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function TierFields({
  action,
  courses,
  tier,
  submitLabel,
}: {
  action: Parameters<typeof ActionForm>[0]["action"];
  courses: { id: string; title: string }[];
  tier?: { name: string; description: string; price: number; published: boolean; included: Set<string> };
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!tier} footerClassName={tier ? undefined : "justify-end"}>
      <Field label="Name">
        <Input name="name" required defaultValue={tier?.name} placeholder="e.g. Foundation" />
      </Field>
      <Field label="Price">
        <span className="flex rounded-lg shadow-card focus-within:ring-3 focus-within:ring-primary-100">
          <span className="grid place-items-center rounded-l-lg border border-r-0 border-line bg-ink-50 px-3 text-sm text-ink-500">₦</span>
          <Input
            name="priceNaira"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={tier ? tier.price / 100 : ""}
            className="rounded-l-none shadow-none focus:ring-0"
          />
        </span>
      </Field>
      <Field label="Description" optional>
        <Input name="description" defaultValue={tier?.description} placeholder="One line shown on the enrolment page" />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">Unlocks these courses</legend>
        {courses.length === 0 ? (
          <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-500">Add courses to this programme first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {courses.map((c) => (
              <CheckCard key={c.id} name="courseIds" value={c.id} label={c.title} defaultChecked={tier?.included.has(c.id)} />
            ))}
          </div>
        )}
      </fieldset>
      <Switch name="published" label="Available to buy" defaultChecked={tier?.published ?? true} />
    </ActionForm>
  );
}
