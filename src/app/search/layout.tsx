import { isEmailVerified, requireSession } from "@/lib/auth";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmail";

export default async function SearchLayout({ children }: LayoutProps<"/search">) {
  const session = await requireSession("/search");
  const verified = await isEmailVerified(session.userId);

  return (
    <DashboardShell
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={await getShellUser(session)}
      title="Search"
    >
      {!verified && <VerifyEmailBanner email={session.email} />}
      {children}
    </DashboardShell>
  );
}
