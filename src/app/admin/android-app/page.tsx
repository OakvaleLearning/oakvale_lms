import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { headObject, isStorageConfigured } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { Panel } from "@/components/admin/forms";
import { PageHeader } from "@/components/dashboard/ui";
import { ApkUpload } from "@/components/admin/ApkUpload";
import { ANDROID_APK_KEY, ANDROID_DOWNLOAD_PATH } from "@/lib/android-app";
import { getAndroidRelease } from "@/lib/android-release";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Android app" };
export const dynamic = "force-dynamic";

export default async function AndroidAppPage() {
  await requireAdmin();
  const storage = isStorageConfigured();
  const [current, release, devices] = await Promise.all([
    storage ? headObject(ANDROID_APK_KEY).catch(() => null) : null,
    getAndroidRelease().catch(() => null),
    prisma.pushDevice.count({ where: { platform: "android" } }),
  ]);
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${ANDROID_DOWNLOAD_PATH}`;
  const promptOn = Boolean(process.env.NEXT_PUBLIC_ANDROID_APK_URL);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Mobile"
        title="Android app"
        description="The app file learners download on Android phones. Upload a new build here to release an update."
      />

      <Panel title="Current version">
        {current ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-500">Version</dt>
              <dd className="font-medium text-ink-900">
                {release ? `${release.version} (code ${release.versionCode})` : "Not recorded"}
                {release && release.minVersionCode >= release.versionCode && <span className="ml-2 text-xs font-normal text-ink-500">required update</span>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Phones with notifications on</dt>
              <dd className="font-medium text-ink-900">{devices}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Uploaded</dt>
              <dd className="font-medium text-ink-900">{current.updatedAt ? formatDate(current.updatedAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Size</dt>
              <dd className="font-medium text-ink-900">{(current.size / 1024 / 1024).toFixed(1)} MB</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-500">Download link</dt>
              <dd className="break-all font-mono text-[13px] text-ink-900">
                <a href={ANDROID_DOWNLOAD_PATH} className="text-primary-700 underline underline-offset-2">
                  {link}
                </a>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-ink-600">
            {storage ? "No app uploaded yet. Learners can't download it until you upload one." : "File storage isn't configured, so the app can't be uploaded."}
          </p>
        )}
        <p className="mt-4 border-t border-line pt-4 text-sm text-ink-600">
          {promptOn ? (
            <>The download prompt is <strong className="text-ink-900">on</strong>: Android visitors see it on the sign-in pages and on My learning.</>
          ) : (
            <>
              The download prompt is <strong className="text-ink-900">off</strong>. To turn it on, set{" "}
              <code className="rounded bg-ink-100 px-1 py-0.5 text-[13px]">NEXT_PUBLIC_ANDROID_APK_URL</code> to the download link above in Vercel and redeploy.
            </>
          )}
        </p>
      </Panel>

      {storage && (
        <Panel
          title={current ? "Release an update" : "Upload the app"}
          description="Use a signed release APK from npm run build:apk. Phones with the app see an update message the next time they open it."
        >
          <ApkUpload hasCurrent={Boolean(current)} nextCode={(release?.versionCode ?? 0) + 1} />
        </Panel>
      )}
    </div>
  );
}
