import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_CATEGORIES, categoryOf } from "@/lib/audit";
import { auditTime, auditWhere, readAuditFilters } from "@/lib/audit-query";

/** Quote a CSV cell; a leading = + - @ is neutralised so spreadsheets don't run it as a formula. */
function cell(value: string | null | undefined): string {
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** The activity log as CSV, with the same filters as /admin/activity (up to 20,000 rows). */
export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.auditLog.findMany({
    where: auditWhere(readAuditFilters(sp)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20_000,
  });

  const header = ["Time (Lagos)", "Time (UTC)", "Admin", "Admin email", "Category", "Action", "What happened", "Details", "Record", "IP address"];
  const lines = rows.map((r) => {
    const cat = categoryOf(r.action);
    return [
      auditTime(r.createdAt),
      r.createdAt.toISOString(),
      r.actorName,
      r.actorEmail,
      cat ? AUDIT_CATEGORIES[cat].label : "",
      r.action,
      r.summary,
      r.details ? JSON.stringify(r.details) : "",
      r.targetType && r.targetId ? `${r.targetType}:${r.targetId}` : "",
      r.ip,
    ]
      .map(cell)
      .join(",");
  });

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse([header.map(cell).join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oakvale-admin-activity-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
