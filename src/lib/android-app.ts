import release from "@/content/android-release.json";

/**
 * The Android app learners download. `npm run build:apk` in ../oakvale-mobile
 * copies the signed APK to public/downloads/ and writes its details to
 * src/content/android-release.json; committing and deploying releases it.
 * versionCode 0 means no app has been built yet (the prompt stays hidden).
 */
export interface AndroidRelease {
  version: string;
  /** Android versionCode; the app compares it with its own to offer the update. */
  versionCode: number;
  /** Builds below this must update before they can be used. */
  minVersionCode: number;
  notes: string;
  sizeBytes: number;
  builtAt: string;
}

export const ANDROID_RELEASE: AndroidRelease = release;
export const ANDROID_APK_PATH = "/downloads/oakvale-learning.apk";
export const hasAndroidApp = ANDROID_RELEASE.versionCode > 0;
