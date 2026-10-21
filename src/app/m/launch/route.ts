import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyLessonTicket } from "@/lib/auth";

/** Swaps a mobile lesson ticket for a cookie session, then opens the bare player. */
export async function GET(req: Request) {
  const ticket = new URL(req.url).searchParams.get("ticket") ?? "";
  const claims = await verifyLessonTicket(ticket);
  const user = claims && (await prisma.user.findUnique({ where: { id: claims.userId } }));
  if (!claims || !user) return new NextResponse("This link has expired. Go back and open the lesson again.", { status: 401 });

  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  return NextResponse.redirect(new URL(`/m/lesson/${claims.lessonId}`, req.url), { headers: { "Cache-Control": "no-store" } });
}
