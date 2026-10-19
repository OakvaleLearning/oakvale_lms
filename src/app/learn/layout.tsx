import { requireSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function LearnLayout({ children }: LayoutProps<"/learn">) {
  const session = await requireSession("/learn");

  return (
    <DashboardShell
      // Admins can open learner pages to preview content.
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={{ name: session.name, email: session.email, role: session.role }}
      title="My learning"
    >
      {children}
    </DashboardShell>
  );
}
