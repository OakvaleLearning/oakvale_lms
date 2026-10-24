import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { mediaUrl } from "@/lib/community/shared";
import { PageHeader } from "@/components/dashboard/ui";
import { ActionForm, Field, Input } from "@/components/admin/forms";
import { AvatarField } from "@/components/community/AvatarField";
import { saveAccount } from "./actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function AccountPage() {
  const session = await requireSession("/account");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true, email: true, phone: true, communityProfile: { select: { avatar: true } } },
  });
  const avatar = user.communityProfile?.avatar;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Your profile" description="Your photo and contact details." />

      <section className="card space-y-6 p-6">
        <div>
          <h2 className="text-sm font-semibold text-ink-950">Photo</h2>
          <div className="mt-4">
            <AvatarField name={user.name} current={avatar ? mediaUrl(avatar) : null} enabled={isStorageConfigured()} />
          </div>
        </div>

        <div className="border-t border-line pt-6">
          <ActionForm action={saveAccount} submitLabel="Save profile">
            <Field label="Full name" hint="Certificates issued from now on use this name, so use your legal name.">
              <Input name="name" required minLength={2} maxLength={120} defaultValue={user.name} autoComplete="name" />
            </Field>
            <Field label="Email" hint="Contact support if you need to change the email you sign in with.">
              <Input value={user.email} disabled readOnly />
            </Field>
            <Field label="WhatsApp number" optional={session.role === "ADMIN"}>
              <Input
                name="phone"
                type="tel"
                required={session.role !== "ADMIN"}
                maxLength={25}
                defaultValue={user.phone ?? ""}
                placeholder="0810 818 9514"
                autoComplete="tel"
              />
            </Field>
          </ActionForm>
        </div>
      </section>

      {session.role !== "ADMIN" && (
        <p className="text-sm text-ink-500">
          Headline, bio and community emails are in your{" "}
          <Link href="/community/settings" className="font-medium text-primary-700 hover:underline">
            community settings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
