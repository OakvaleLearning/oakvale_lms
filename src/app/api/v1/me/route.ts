import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, publicUser, requireApiSession } from "@/lib/api/mobile";

/** The signed-in user; the app calls this on start to check its token. */
export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return jsonError("Not authenticated", 401);
  return NextResponse.json({ user: publicUser(user) });
}
