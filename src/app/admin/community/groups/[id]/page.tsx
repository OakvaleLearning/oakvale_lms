import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { groupMemberWhere } from "@/lib/community/access";
import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { ActionForm, Field, Panel, Textarea, TitleSlugFields } from "@/components/admin/forms";
import { AudienceFields } from "@/components/admin/AudienceFields";
import { CoverImageField } from "@/components/admin/CoverImageField";
import { setGroupArchived, updateGroup } from "../../actions";

export const metadata: Metadata = { title: "Community group" };

export default async function AdminGroupPage({ params }: PageProps<"/admin/community/groups/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const group = await prisma.communityGroup.findUnique({ where: { id } });
  if (!group) notFound();

  const [programs, members] = await Promise.all([
    prisma.program.findMany({
      orderBy: { order: "asc" },
      select: { id: true, title: true, tiers: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.user.count({ where: groupMemberWhere(group) }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Breadcrumbs items={[{ label: "Community", href: "/admin/community" }, { label: group.name }]} />
      <PageHeader
        title={group.name}
        description={`${members} ${members === 1 ? "member" : "members"}${group.archived ? " · Archived (hidden from learners)" : ""}`}
        actions={
          <>
            <ButtonLink href={`/community/${group.slug}`} variant="outline" size="sm">
              View group <ArrowUpRight className="size-4" />
            </ButtonLink>
            <form action={setGroupArchived.bind(null, group.id, !group.archived)}>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900">
                {group.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {group.archived ? "Restore" : "Archive"}
              </button>
            </form>
          </>
        }
      />

      <Panel title="Details">
        <ActionForm action={updateGroup.bind(null, group.id)} submitLabel="Save changes">
          <TitleSlugFields titleLabel="Name" defaultTitle={group.name} defaultSlug={group.slug} />
          <AudienceFields programs={programs} defaults={group} />
          <Field label="Description" optional>
            <Textarea name="description" rows={4} defaultValue={group.description} />
          </Field>
        </ActionForm>
      </Panel>

      <Panel title="Cover image" description="Shown across the top of the group.">
        <CoverImageField target={{ kind: "group", id: group.id }} current={group.coverImage} />
      </Panel>
    </div>
  );
}
