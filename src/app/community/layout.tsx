import { requireSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function CommunityLayout({ children }: LayoutProps<"/community">) {
  const session = await requireSession("/community");
  return (
    <DashboardShell
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={{ name: session.name, email: session.email, role: session.role }}
      title="Community"
    >
      {children}
    </DashboardShell>
  );
}
