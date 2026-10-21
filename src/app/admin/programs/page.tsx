import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { EmptyState, PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { ActionForm, Dialog, Field, MoveButtons, Textarea, TitleSlugFields } from "@/components/admin/forms";
import { createProgram, moveItem } from "../actions";

export const metadata: Metadata = { title: "Programmes" };

function NewProgrammeDialog() {
  return (
    <Dialog
      title="New programme"
      description="You can add courses, pricing tiers and a cover image next."
      trigger={
        <>
          <Plus className="size-4" /> New programme
        </>
      }
    >
      <ActionForm action={createProgram} submitLabel="Create programme" footerClassName="justify-end">
        <TitleSlugFields />
        <Field label="Description" optional>
          <Textarea name="description" rows={3} placeholder="What learners will gain from this programme" />
        </Field>
      </ActionForm>
    </Dialog>
  );
}

export default async function ProgramsPage() {
  await requireAdmin();
  const programs = await prisma.program.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { courses: true, tiers: true } },
      tiers: { select: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Programmes"
        description="Each programme groups its courses and the pricing tiers learners buy."
        actions={programs.length > 0 && <NewProgrammeDialog />}
      />

      {programs.length === 0 ? (
        <EmptyState icon={Layers} title="No programmes yet" action={<NewProgrammeDialog />}>
          Create your first programme, then add its courses and pricing.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((p, i) => {
            const learners = p.tiers.reduce((n, t) => n + t._count.enrollments, 0);
            return (
              <li key={p.id} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-raised">
                <Link href={`/admin/programs/${p.id}`} className="flex flex-1 flex-col">
                  <div className="relative aspect-[16/8] overflow-hidden border-b border-line bg-primary-50">
                    {p.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- covers come from /media redirects or external URLs
                      <img
                        src={p.coverImage}
                        alt=""
                        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid size-full place-items-center">
                        <Layers className="size-7 text-primary-300" />
                      </div>
                    )}
                    <span className="absolute left-3 top-3">
                      <StatusBadge status={p.published ? "PUBLISHED" : "DRAFT"} />
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-semibold leading-snug text-ink-950">{p.title}</h2>
                    <p className="mt-0.5 text-xs text-ink-400">/{p.slug}</p>
                    <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                      {[
                        ["Courses", p._count.courses],
                        ["Tiers", p._count.tiers],
                        ["Learners", learners],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dd className="text-lg font-semibold tabular-nums text-ink-950">{value}</dd>
                          <dt className="text-xs text-ink-500">{label}</dt>
                        </div>
                      ))}
                    </dl>
                  </div>
                </Link>
                <div className="flex items-center justify-between border-t border-line bg-canvas/60 px-3 py-1.5">
                  <span className="flex items-center gap-1 text-xs text-ink-400">
                    <MoveButtons onMove={moveItem.bind(null, "program", p.id)} />
                    Position {i + 1}
                  </span>
                  <Link
                    href={`/admin/programs/${p.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-sm font-medium text-primary-700 hover:text-primary-900"
                  >
                    Manage <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
