import { isEmailVerified, requireSession } from "@/lib/auth";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmail";

export default async function ProgrammesLayout({ children }: LayoutProps<"/programmes">) {
  const session = await requireSession("/programmes");
  const verified = await isEmailVerified(session.userId);

  return (
    <DashboardShell
      // Admins can open learner pages to preview content.
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={await getShellUser(session)}
      title="Programmes"
    >
      {!verified && <VerifyEmailBanner email={session.email} />}
      {children}
    </DashboardShell>
  );
}
