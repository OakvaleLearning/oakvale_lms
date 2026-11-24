import { headers } from "next/headers";
import Image from "next/image";
import { Download, Smartphone } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ANDROID_APK_PATH, ANDROID_RELEASE, hasAndroidApp } from "@/lib/android-app";

/** Who is looking: an Android phone, an iPhone/iPad, or a computer. */
type Device = "android" | "ios" | "desktop";

/** From the user agent; null inside the app's own WebView. iPads asking for the desktop site count as computers. */
function deviceFrom(ua: string): Device | null {
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  // Android WebViews add "; wv)"; iOS in-app WebViews lack "Safari/".
  if (/; wv\)/i.test(ua) || (ios && !/Safari\//i.test(ua))) return null;
  return android ? "android" : ios ? "ios" : "desktop";
}

const SIZE_MB = Math.round(ANDROID_RELEASE.sizeBytes / 1024 / 1024);
const INSTALL_HINT = "On your phone, open the downloaded file. If Android asks, allow installs from your browser, then tap Install.";

function DownloadButton({ className }: { className?: string }) {
  return (
    <a href={ANDROID_APK_PATH} download="Oakvale-Learning.apk" className={cn(buttonClass({ variant: "primary", size: "md" }), className)}>
      <Download className="size-4" /> Download the app{SIZE_MB > 0 ? ` (${SIZE_MB} MB)` : ""}
    </a>
  );
}

function Qr({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small SVG from our own route
  return <img src="/api/app/android-qr" alt="QR code to download the Oakvale app" width={96} height={96} className={cn("shrink-0 rounded-md bg-white", className)} />;
}

/**
 * Advertises the Android app (an APK, see src/lib/android-app.ts) on the
 * sign-in pages (`variant="auth"`) and the learner overview
 * (`variant="overview"`): a download button on Android, plus a QR code to scan
 * with an Android phone on computers; iPhone and iPad visitors are told it's
 * coming to the App Store soon. Hidden until an APK has been built, and inside
 * the app itself.
 */
export async function AppDownload({ variant }: { variant: "auth" | "overview" }) {
  if (!hasAndroidApp) return null;
  const device = deviceFrom((await headers()).get("user-agent") ?? "");
  if (!device) return null;

  const title = device === "ios" ? "The Oakvale app is coming to iPhone" : "Get the Oakvale app";
  const text =
    device === "ios"
      ? "It’s coming to the App Store soon. Until then, you can keep learning right here in your browser."
      : "Open your modules straight from your home screen and keep learning on your Android phone.";

  if (variant === "auth") {
    return (
      <aside aria-label="Mobile app" className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Image src="/icon-192.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{text}</p>
          </div>
          {device === "desktop" && <Qr className="-my-1 ml-auto size-16" />}
        </div>
        {device !== "ios" && (
          <>
            <DownloadButton className="mt-3 w-full justify-center" />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              {device === "desktop" ? "Scan the code with your Android phone’s camera, or download the file and send it to your phone. " : ""}
              {INSTALL_HINT}
            </p>
          </>
        )}
      </aside>
    );
  }

  return (
    <aside aria-label="Mobile app" className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
        <Smartphone className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl text-ink-950">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{text}</p>
        {device !== "ios" && (
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            {device === "desktop" ? "Scan the code with your Android phone’s camera, or download the file and send it to your phone. " : ""}
            {INSTALL_HINT}
          </p>
        )}
      </div>
      {device !== "ios" && (
        <div className="flex shrink-0 items-center gap-4">
          {device === "desktop" && <Qr className="size-24 border border-line" />}
          <DownloadButton className="w-full justify-center sm:w-auto" />
        </div>
      )}
    </aside>
  );
}
