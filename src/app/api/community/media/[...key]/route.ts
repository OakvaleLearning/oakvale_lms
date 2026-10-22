import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isStorageConfigured, presignDownload } from "@/lib/storage";
import { hasCommunityAccess, isGroupMember } from "@/lib/community/access";

// Presigned URLs live ~55 minutes; let the browser reuse the redirect for less than that.
const CACHE_SECONDS = 45 * 60;

/**
 * Community images: post and event images only for members of that group,
 * avatars for anyone in the community. Redirects to a short-lived URL.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/community/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!key.startsWith("community/") || key.includes("..") || !isStorageConfigured()) return notFound();

  const session = await getSession();
  if (!session) return notFound();
  const [, scope, owner] = key.split("/");
  const allowed =
    scope === "avatars" ? owner === session.userId || (await hasCommunityAccess(session)) : await isGroupMember(session, scope);
  if (!allowed) return notFound();

  return NextResponse.redirect(await presignDownload(key), {
    status: 302,
    headers: { "Cache-Control": `private, max-age=${CACHE_SECONDS}` },
  });
}
