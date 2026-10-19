import { getSession } from "@/lib/auth";
import { checkAssetAccess } from "@/lib/lms/access";
import { contentPrefix } from "@/lib/lms/packages";
import { getObject } from "@/lib/storage";

/**
 * Serves files of unpacked SCORM / HTML packages from R2.
 *
 * Must stay on the app's own origin: SCORM content finds its runtime API by
 * walking up to the parent window (window.parent.API / API_1484_11), which
 * browsers only allow for same-origin frames. Packages are uploaded by admins
 * only, so running their scripts on this origin is acceptable.
 */
export async function GET(_req: Request, ctx: RouteContext<"/content/[assetId]/[...path]">) {
  const { assetId, path } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Not authenticated", { status: 401 });

  const access = await checkAssetAccess(session, assetId);
  if (!access.ok) return new Response("Not found", { status: 404 });

  const relative = path.map((p) => decodeURIComponent(p)).join("/");
  if (relative.split("/").includes("..")) return new Response("Not found", { status: 404 });

  const object = await getObject(contentPrefix(assetId) + relative);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": object.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
  if (object.etag) headers.set("ETag", object.etag);
  return new Response(object.body, { headers });
}
