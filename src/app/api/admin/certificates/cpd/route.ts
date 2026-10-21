import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyUrl } from "@/lib/lms/certificates";

const STATUSES = ["PENDING", "SUBMITTED", "ISSUED"] as const;

/** Quote a CSV cell; a leading = + - @ is neutralised so spreadsheets don't run it as a formula. */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d+$/.test(s)) s = `'${s}`; // phone numbers stay as they are
  return `"${s.replace(/"/g, '""')}"`;
}

/** CPD requests as CSV, to send to the issuing body. */
export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const param = new URL(req.url).searchParams.get("status");
  const status = STATUSES.find((s) => s === param) ?? "PENDING";
  const certificates = await prisma.certificate.findMany({
    where: { cpdStatus: status, revokedAt: null },
    orderBy: { issuedAt: "asc" },
    include: { user: { select: { email: true, phone: true } } },
  });

  const header = ["Full name", "Email", "Phone", "Course", "Programme", "CPD hours", "Issuing body", "Completed on", "Score (%)", "Oakvale certificate ID", "Verification link"];
  const lines = certificates.map((c) =>
    [
      c.recipientName,
      c.user.email,
      c.user.phone,
      c.courseTitle,
      c.programTitle,
      c.cpdHours,
      c.cpdProvider,
      c.issuedAt.toISOString().slice(0, 10),
      c.score,
      c.serial,
      verifyUrl(c.serial),
    ]
      .map(cell)
      .join(",")
  );
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cpd-${status.toLowerCase()}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
