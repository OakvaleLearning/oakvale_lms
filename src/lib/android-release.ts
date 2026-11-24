import "server-only";
import { getObjectBytes, isStorageConfigured, putObject } from "@/lib/storage";
import { ANDROID_RELEASE_KEY, type AndroidRelease } from "@/lib/android-app";

/** The current Android release's details, or null before the first upload with them. */
export async function getAndroidRelease(): Promise<AndroidRelease | null> {
  if (!isStorageConfigured()) return null;
  try {
    const bytes = await getObjectBytes(ANDROID_RELEASE_KEY);
    return JSON.parse(new TextDecoder().decode(bytes)) as AndroidRelease;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

export async function saveAndroidRelease(release: AndroidRelease) {
  await putObject(ANDROID_RELEASE_KEY, JSON.stringify(release), "application/json");
}
