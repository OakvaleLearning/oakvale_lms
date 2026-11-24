/**
 * The Android app (APK) learners download. It lives at one fixed key in the
 * private bucket; uploading a new file replaces it (S3 swaps the object only
 * once the upload completes). Learners get it from the stable link
 * /download/android, which redirects to a short-lived signed URL.
 */
export const ANDROID_APK_KEY = "app/android/oakvale-learning.apk";
export const APK_CONTENT_TYPE = "application/vnd.android.package-archive";
export const APK_DOWNLOAD_NAME = "Oakvale-Learning.apk";
export const MAX_APK_BYTES = 400 * 1024 * 1024;
export const ANDROID_DOWNLOAD_PATH = "/download/android";
/** Details of the current release, saved next to the APK on upload. */
export const ANDROID_RELEASE_KEY = "app/android/latest.json";

export interface AndroidRelease {
  version: string;
  /** Android versionCode; the app compares it with its own to offer the update. */
  versionCode: number;
  notes: string;
  /** Builds below this must update before they can be used. */
  minVersionCode: number;
  uploadedAt: string;
}
