import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/ui";
import {
  ActionForm,
  Checkbox,
  DeleteButton,
  Field,
  Input,
  MoveButtons,
  Panel,
  Textarea,
  TitleSlugFields,
} from "@/components/admin/forms";
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
      courses: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { _count: { select: { modules: true } } } },
      tiers: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: { courses: { select: { courseId: true } }, _count: { select: { enrollments: true } } },
      },
    },
  });
  if (!program) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/programs" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-primary-600">
        <ArrowLeft className="size-4" /> Programmes
      </Link>

      <Panel
        title={program.title}
        actions={
          <DeleteButton
            onDelete={deleteProgram.bind(null, program.id)}
            confirmText={`Delete “${program.title}” and all of its courses and content? This cannot be undone.`}
            label="Delete"
          />
        }
      >
        <ActionForm action={updateProgram.bind(null, program.id)}>
          <TitleSlugFields defaultTitle={program.title} defaultSlug={program.slug} />
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={program.description} />
          </Field>
          <Field label="Cover image URL" hint="Optional">
            <Input name="coverImage" type="url" defaultValue={program.coverImage ?? ""} />
          </Field>
          <Checkbox name="published" label="Published (visible for enrolment)" defaultChecked={program.published} />
        </ActionForm>
      </Panel>

      <Panel title="Courses">
        {program.courses.length === 0 ? (
          <p className="text-sm text-ink-400">No courses yet.</p>
        ) : (
          <ul className="-my-2 divide-y divide-ink-50">
            {program.courses.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <MoveButtons onMove={moveItem.bind(null, "course", c.id)} />
                <Link href={`/admin/courses/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink-900">{c.title}</div>
                    <div className="text-xs text-ink-400">
                      /{c.slug} · {c._count.modules} modules
                    </div>
                  </div>
                  <StatusBadge status={c.published ? "PUBLISHED" : "DRAFT"} />
                  <ChevronRight className="size-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-6 rounded-2xl border border-ink-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary-600">Add a course</summary>
          <ActionForm action={createCourse.bind(null, program.id)} submitLabel="Create course" className="mt-4">
            <TitleSlugFields />
            <Field label="Description">
              <Textarea name="description" rows={2} />
            </Field>
          </ActionForm>
        </details>
      </Panel>

      <Panel
        title="Tiers & pricing"
        actions={
          <a
            href={`/enroll?track=${program.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary-600"
          >
            Enrolment page <ExternalLink className="size-3.5" />
          </a>
        }
      >
        <p className="mb-4 text-sm text-ink-500">
          A tier is what learners buy. Tick the courses each tier unlocks. The marketing site links to{" "}
          <code className="rounded bg-ink-50 px-1">/enroll?track={program.slug}&amp;tier=&lt;tier-slug&gt;</code>.
        </p>
        <div className="space-y-4">
          {program.tiers.map((t) => {
            const included = new Set(t.courses.map((c) => c.courseId));
            return (
              <div key={t.id} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MoveButtons onMove={moveItem.bind(null, "tier", t.id)} />
                    <span className="font-semibold text-ink-900">{t.name}</span>
                    <span className="text-sm text-ink-500">{formatNaira(t.price)}</span>
                    <span className="text-xs text-ink-400">· {t._count.enrollments} enrolments</span>
                  </div>
                  <DeleteButton
                    onDelete={deleteTier.bind(null, t.id)}
                    confirmText={`Delete the “${t.name}” tier?`}
                  />
                </div>
                <TierFields action={updateTier.bind(null, t.id)} courses={program.courses} tier={{ ...t, included }} />
              </div>
            );
          })}
          <details className="rounded-2xl border border-dashed border-ink-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary-600">Add a tier</summary>
            <div className="mt-4">
              <TierFields action={createTier.bind(null, program.id)} courses={program.courses} submitLabel="Create tier" />
            </div>
          </details>
        </div>
      </Panel>
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
  tier?: { name: string; slug: string; description: string; price: number; published: boolean; included: Set<string> };
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!tier}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <Input name="name" required defaultValue={tier?.name} />
        </Field>
        <Field label="Slug" hint="e.g. foundation">
          <Input name="slug" required defaultValue={tier?.slug} />
        </Field>
        <Field label="Price (₦)">
          <Input name="priceNaira" type="number" min={0} step={1} required defaultValue={tier ? tier.price / 100 : ""} />
        </Field>
      </div>
      <Field label="Description">
        <Input name="description" defaultValue={tier?.description} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">Unlocks these courses</legend>
        {courses.length === 0 ? (
          <p className="text-xs text-ink-400">Add courses first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {courses.map((c) => (
              <Checkbox key={c.id} name="courseIds" value={c.id} label={c.title} defaultChecked={tier?.included.has(c.id)} />
            ))}
          </div>
        )}
      </fieldset>
      <Checkbox name="published" label="Available to buy" defaultChecked={tier?.published ?? true} />
    </ActionForm>
  );
}
