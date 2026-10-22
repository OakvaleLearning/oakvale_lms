import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/community/notifications";

/** Badge count for the Community link in the sidebar. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ count: await unreadNotificationCount(session.userId) });
}
