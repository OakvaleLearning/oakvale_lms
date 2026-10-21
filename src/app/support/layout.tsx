import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function SupportLayout({ children }: LayoutProps<"/support">) {
  const session = await requireSession("/support");
  // Admins answer from the inbox instead.
  if (session.role === "ADMIN") redirect("/admin/support");

  return (
    <DashboardShell
      variant="learner"
      user={{ name: session.name, email: session.email, role: session.role }}
      title="Support"
    >
      {children}
    </DashboardShell>
  );
}
