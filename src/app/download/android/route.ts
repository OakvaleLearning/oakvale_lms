import { NextResponse } from "next/server";
import { headObject, isStorageConfigured, presignDownload } from "@/lib/storage";
import { ANDROID_APK_KEY, APK_DOWNLOAD_NAME } from "@/lib/android-app";

/**
 * Stable public link to the Android app (see src/lib/android-app.ts). Point
 * NEXT_PUBLIC_ANDROID_APK_URL here to turn on the download prompt.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isStorageConfigured() || !(await headObject(ANDROID_APK_KEY))) {
    return new NextResponse("The Android app isn't available to download yet. Please try again later.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const url = await presignDownload(ANDROID_APK_KEY, { downloadName: APK_DOWNLOAD_NAME });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
