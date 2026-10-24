import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyLessonTicket } from "@/lib/auth";

/** Swaps a mobile lesson ticket for a cookie session, then opens the bare player. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ticket = params.get("ticket") ?? "";
  const block = params.get("block");
  const claims = await verifyLessonTicket(ticket);
  const user = claims && (await prisma.user.findUnique({ where: { id: claims.userId } }));
  if (!claims || !user) return new NextResponse("This link has expired. Go back and open the lesson again.", { status: 401 });

  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  const target = new URL(`/m/lesson/${claims.lessonId}`, req.url);
  if (block) target.searchParams.set("block", block.slice(0, 40));
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
}
