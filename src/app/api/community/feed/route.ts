import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { countNewPosts, listPosts } from "@/lib/community/feed";

/**
 * Feed pages for infinite scroll: `?group=<id>&cursor=<postId>`.
 * With `?since=<ISO>` it only counts newer posts, for the "new posts" pill.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const groupId = params.get("group") || undefined;
  const since = params.get("since");
  if (since) {
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    return NextResponse.json({ count: await countNewPosts(session, date, groupId) });
  }
  const page = await listPosts(session, {
    groupId,
    cursor: params.get("cursor") || undefined,
    excludePinned: Boolean(groupId),
  });
  return NextResponse.json(page);
}
