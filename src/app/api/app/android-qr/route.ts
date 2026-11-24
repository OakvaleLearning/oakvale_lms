import bwipjs from "bwip-js/node";
import { appUrl } from "@/lib/email-templates";
import { ANDROID_APK_PATH, ANDROID_RELEASE } from "@/lib/android-app";

/** QR code for the Android app download, shown in the app prompt on computers. */
export function GET() {
  const svg = bwipjs.toSVG({ bcid: "qrcode", text: `${appUrl()}${ANDROID_APK_PATH}`, scale: 3, paddingwidth: 2, paddingheight: 2 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // The link only changes with the domain; the version busts caches on release.
      "Cache-Control": "public, max-age=86400",
      ETag: `"apk-${ANDROID_RELEASE.versionCode}"`,
    },
  });
}
