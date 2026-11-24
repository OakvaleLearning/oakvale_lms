import { NextResponse } from "next/server";
import { ANDROID_APK_PATH, ANDROID_RELEASE, hasAndroidApp } from "@/lib/android-app";

/** The latest Android app, for the app's update check. Public: the app checks before sign-in too. */
export function GET(req: Request) {
  if (!hasAndroidApp) return NextResponse.json({ release: null });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const { version, versionCode, minVersionCode, notes } = ANDROID_RELEASE;
  return NextResponse.json({
    release: { version, versionCode, minVersionCode, notes, downloadUrl: `${origin}${ANDROID_APK_PATH}` },
  });
}
