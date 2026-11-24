import { NextResponse } from "next/server";
import { getAndroidRelease } from "@/lib/android-release";
import { ANDROID_DOWNLOAD_PATH } from "@/lib/android-app";

/**
 * The latest Android app, for the app's update check. Public: the app checks
 * before sign-in too. `downloadUrl` is the stable /download/android link.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const release = await getAndroidRelease().catch((err) => {
    console.error("[app] release lookup failed:", err);
    return null;
  });
  if (!release) return NextResponse.json({ release: null }, { headers: { "Cache-Control": "no-store" } });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json(
    {
      release: {
        version: release.version,
        versionCode: release.versionCode,
        minVersionCode: release.minVersionCode,
        notes: release.notes,
        uploadedAt: release.uploadedAt,
        downloadUrl: `${origin}${ANDROID_DOWNLOAD_PATH}`,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
