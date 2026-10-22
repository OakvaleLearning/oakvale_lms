import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { mediaUrl } from "@/lib/community/shared";
import { Breadcrumbs, PageHeader } from "@/components/dashboard/ui";
import { ActionForm, Field, Input, Switch, Textarea } from "@/components/admin/forms";
import { AvatarField } from "@/components/community/AvatarField";
import { saveProfile } from "../actions";

export const metadata: Metadata = { title: "Community settings" };

export default async function CommunitySettings({ searchParams }: PageProps<"/community/settings">) {
  const session = await requireSession("/community/settings");
  const { unsubscribed } = await searchParams;
  const profile = await prisma.communityProfile.findUnique({ where: { userId: session.userId } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Community", href: "/community" }, { label: "Settings" }]} />
      <PageHeader title="Your community profile" description="How other learners see you, and which community emails you get." />

      {unsubscribed && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" /> You&apos;re unsubscribed from the weekly digest. You can turn it back on below.
        </p>
      )}

      <section className="card space-y-6 p-6">
        <div>
          <h2 className="text-sm font-semibold text-ink-950">Photo</h2>
          <div className="mt-4">
            <AvatarField name={session.name} current={profile?.avatar ? mediaUrl(profile.avatar) : null} enabled={isStorageConfigured()} />
          </div>
        </div>

        <div className="border-t border-line pt-6">
          <ActionForm action={saveProfile} submitLabel="Save profile">
            <Field label="Name" hint="Your name comes from your account.">
              <Input value={session.name} disabled readOnly />
            </Field>
            <Field label="Headline" optional hint="e.g. “Care assistant in Abuja” or “Studying Childcare & Early Years”">
              <Input name="headline" maxLength={80} defaultValue={profile?.headline} />
            </Field>
            <Field label="Location" optional>
              <Input name="location" maxLength={80} defaultValue={profile?.location} placeholder="City, country" />
            </Field>
            <Field label="About you" optional hint="Up to 280 characters.">
              <Textarea name="bio" rows={4} maxLength={280} defaultValue={profile?.bio} placeholder="A little about your care experience and what you hope to learn" />
            </Field>

            <div className="space-y-3 border-t border-line pt-5">
              <h2 className="text-sm font-semibold text-ink-950">Email notifications</h2>
              <Switch
                name="notifyEmail"
                defaultChecked={profile?.notifyEmail ?? true}
                label="Replies and comments"
                description="When someone comments on your post or replies to your comment (at most one email per post an hour)."
              />
              <Switch
                name="digest"
                defaultChecked={!(profile?.digestOptOut ?? false)}
                label="Weekly digest"
                description="A Monday round-up of popular posts and upcoming events in your groups."
              />
              <p className="text-xs text-ink-500">Event reminders are always sent for events you RSVP to.</p>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
