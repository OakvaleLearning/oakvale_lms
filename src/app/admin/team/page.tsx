import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/utils";
import { ActionForm, DeleteButton, Field, Input, Panel } from "@/components/admin/forms";
import { ResendInviteButton } from "@/components/admin/ResendInviteButton";
import { PageHeader } from "@/components/dashboard/ui";
import { addAdmin, removeAdmin } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireAdmin();
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="People"
        title="Team"
        description={`${admins.length} ${admins.length === 1 ? "admin" : "admins"} with full access to this dashboard`}
      />

      <Panel title="Admins" flush>
        <ul className="divide-y divide-line/70">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink-900">
                  {a.name}
                  {a.id === session.userId && <span className="ml-2 text-xs font-normal text-ink-400">(you)</span>}
                  {!a.emailVerifiedAt && (
                    <span className="ml-2 rounded-full bg-gold-light/20 px-2 py-0.5 text-xs font-normal text-ink-700">
                      Invite pending
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-ink-400">
                  {a.email} · since {formatDay(a.createdAt)}
                </div>
              </div>
              {!a.emailVerifiedAt && a.id !== session.userId && <ResendInviteButton userId={a.id} />}
              {a.id !== session.userId && admins.length > 1 && (
                <DeleteButton
                  onDelete={removeAdmin.bind(null, a.id)}
                  confirmText={`Remove ${a.name}'s admin access? Their account stays, as a learner.`}
                  label="Remove"
                />
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Add an admin"
        description="New addresses get an email with a link to set their password. An existing learner account is upgraded and keeps its password."
      >
        <ActionForm action={addAdmin} submitLabel="Add admin" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" required autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
          </div>
        </ActionForm>
      </Panel>
    </div>
  );
}
