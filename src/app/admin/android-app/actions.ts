"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queuePush } from "@/lib/push";
import { ensureUploadCors, headObject, isStorageConfigured, presignUpload } from "@/lib/storage";
import { getAndroidRelease, saveAndroidRelease } from "@/lib/android-release";
import { ANDROID_APK_KEY, APK_CONTENT_TYPE, MAX_APK_BYTES } from "@/lib/android-app";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ReleaseInput {
  fileName: string;
  version: string;
  versionCode: number;
  notes: string;
  /** Older builds must update before they can be used. */
  required: boolean;
  /** Send a push notification to app users on older builds. */
  notify: boolean;
}

function check(input: ReleaseInput, previousCode: number | null): string | null {
  if (!/\.apk$/i.test(input.fileName)) return "Please choose an .apk file.";
  if (!/^\d+(\.\d+){0,3}$/.test(input.version.trim())) return "Enter the version, e.g. 1.0.1.";
  if (!Number.isInteger(input.versionCode) || input.versionCode < 1) return "Enter the version code (a whole number, e.g. 2).";
  if (previousCode !== null && input.versionCode <= previousCode) {
    return `The version code must be higher than the current release's (${previousCode}), or phones won't install it as an update.`;
  }
  return null;
}

/** Step 1: check the details, then a presigned PUT URL for the browser to upload the APK to. */
export async function createApkUpload(input: ReleaseInput & { size: number }): Promise<Result<{ uploadUrl: string; contentType: string }>> {
  await requireAdmin();
  if (!isStorageConfigured()) return { ok: false, error: "File storage (AWS S3) is not configured yet." };
  if (!(input.size > 0) || input.size > MAX_APK_BYTES) return { ok: false, error: "That file is too large (max 400 MB)." };
  const previous = await getAndroidRelease();
  const error = check(input, previous?.versionCode ?? null);
  if (error) return { ok: false, error };

  const corsError = await ensureUploadCors(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").origin);
  if (corsError) return { ok: false, error: corsError };

  return { ok: true, contentType: APK_CONTENT_TYPE, uploadUrl: await presignUpload(ANDROID_APK_KEY, APK_CONTENT_TYPE) };
}

/** Step 2: confirm the upload landed, save the release details, and tell app users. */
export async function finishApkUpload(input: ReleaseInput): Promise<Result<{ notified: boolean }>> {
  const admin = await requireAdmin();
  const head = await headObject(ANDROID_APK_KEY);
  if (!head) return { ok: false, error: "The upload didn't arrive. Please try again." };
  const previous = await getAndroidRelease();
  const error = check(input, previous?.versionCode ?? null);
  if (error) return { ok: false, error };

  const version = input.version.trim();
  const notes = input.notes.trim().slice(0, 500);
  await saveAndroidRelease({
    version,
    versionCode: input.versionCode,
    notes,
    minVersionCode: input.required ? input.versionCode : (previous?.minVersionCode ?? 0),
    uploadedAt: new Date().toISOString(),
  });

  if (input.notify) {
    // Phones on an older build (or that haven't reported one).
    queuePush(
      { platform: "android", OR: [{ appBuild: null }, { appBuild: { lt: input.versionCode } }] },
      {
        title: input.required ? "Please update the Oakvale app" : "A new version of the Oakvale app is ready",
        body: notes || `Version ${version} is available. Tap to download it.`,
        url: "update",
      }
    );
  }

  const mb = (head.size / 1024 / 1024).toFixed(1);
  await audit(
    admin,
    "app.upload",
    `Released Android app version ${version} (code ${input.versionCode}, ${mb} MB)${input.required ? ", required update" : ""}${input.notify ? ", app users notified" : ""}`,
    { details: { file: input.fileName.slice(0, 200), version, versionCode: input.versionCode, bytes: head.size, required: input.required, notified: input.notify, notes } }
  );
  revalidatePath("/admin/android-app");
  return { ok: true, notified: input.notify };
}
