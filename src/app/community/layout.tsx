import { requireSession } from "@/lib/auth";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function CommunityLayout({ children }: LayoutProps<"/community">) {
  const session = await requireSession("/community");
  return (
    <DashboardShell
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={await getShellUser(session)}
      title="Community"
    >
      {children}
    </DashboardShell>
  );
}
