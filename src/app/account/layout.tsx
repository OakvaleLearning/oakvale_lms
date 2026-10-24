import { requireSession } from "@/lib/auth";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const session = await requireSession("/account");
  return (
    <DashboardShell variant={session.role === "ADMIN" ? "admin" : "learner"} user={await getShellUser(session)} title="Profile">
      {children}
    </DashboardShell>
  );
}
