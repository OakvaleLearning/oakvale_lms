import { isEmailVerified, requireSession } from "@/lib/auth";
import { isPrelaunch } from "@/lib/launch";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PrelaunchNotice } from "@/components/learn/PrelaunchNotice";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmail";

export default async function LearnLayout({ children }: LayoutProps<"/learn">) {
  const session = await requireSession("/learn");
  const verified = await isEmailVerified(session.userId);

  return (
    <DashboardShell
      // Admins can open learner pages to preview content.
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={await getShellUser(session)}
      title="My learning"
    >
      {!verified && <VerifyEmailBanner email={session.email} />}
      {isPrelaunch() && session.role !== "ADMIN" ? <PrelaunchNotice userId={session.userId} /> : children}
    </DashboardShell>
  );
}
