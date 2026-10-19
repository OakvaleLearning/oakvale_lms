import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { StatusBadge } from "@/components/dashboard/ui";
import { ActionForm, Field, MoveButtons, Panel, Textarea, TitleSlugFields } from "@/components/admin/forms";
import { createProgram, moveItem } from "../actions";

export const metadata: Metadata = { title: "Programmes" };

export default async function ProgramsPage() {
  await requireAdmin();
  const programs = await prisma.program.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { courses: true, tiers: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Panel title="Programmes">
        {programs.length === 0 ? (
          <p className="text-sm text-ink-400">No programmes yet — create one below.</p>
        ) : (
          <ul className="-my-2 divide-y divide-ink-50">
            {programs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <MoveButtons onMove={moveItem.bind(null, "program", p.id)} />
                <Link href={`/admin/programs/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink-900">{p.title}</div>
                    <div className="text-xs text-ink-400">
                      /{p.slug} · {p._count.courses} courses · {p._count.tiers} tiers
                    </div>
                  </div>
                  <StatusBadge status={p.published ? "PUBLISHED" : "DRAFT"} />
                  <ChevronRight className="size-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="New programme">
        <ActionForm action={createProgram} submitLabel="Create programme">
          <TitleSlugFields />
          <Field label="Description">
            <Textarea name="description" rows={3} />
          </Field>
        </ActionForm>
      </Panel>
    </div>
  );
}
