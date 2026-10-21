import { requireSession } from "@/lib/auth";
import { isPrelaunch } from "@/lib/launch";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PrelaunchNotice } from "@/components/learn/PrelaunchNotice";

export default async function LearnLayout({ children }: LayoutProps<"/learn">) {
  const session = await requireSession("/learn");

  return (
    <DashboardShell
      // Admins can open learner pages to preview content.
      variant={session.role === "ADMIN" ? "admin" : "learner"}
      user={{ name: session.name, email: session.email, role: session.role }}
      title="My learning"
    >
      {isPrelaunch() && session.role !== "ADMIN" ? <PrelaunchNotice userId={session.userId} /> : children}
    </DashboardShell>
  );
}
