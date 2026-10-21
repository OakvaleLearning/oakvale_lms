import { NextResponse } from "next/server";
import { COVER_PREFIX, isStorageConfigured, presignDownload } from "@/lib/storage";

// Presigned URLs live ~55 minutes; let browsers reuse the redirect for less than that.
const CACHE_SECONDS = 45 * 60;

/** Public cover images: redirects to a short-lived URL in the private bucket. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  // Only cover images are public; lesson content goes through /content with access checks.
  if (!key.startsWith(COVER_PREFIX) || key.includes("..") || !isStorageConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = await presignDownload(key);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
}
