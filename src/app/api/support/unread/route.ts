import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { learnerUnreadCount, supportUnreadCount } from "@/lib/support";

/** Badge count for the sidebar: unread replies for learners, conversations awaiting a reply for admins. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const count = session.role === "ADMIN" ? await supportUnreadCount() : await learnerUnreadCount(session.userId);
  return NextResponse.json({ count });
}
