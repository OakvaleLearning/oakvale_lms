import { requireAdmin } from "@/lib/auth";
import { getShellUser } from "@/lib/account";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  return (
    <DashboardShell
      variant="admin"
      user={await getShellUser(session)}
      title="Admin"
    >
      {children}
    </DashboardShell>
  );
}
