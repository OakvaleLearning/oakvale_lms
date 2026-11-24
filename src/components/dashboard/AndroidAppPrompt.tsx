"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { ANDROID_APK_PATH, ANDROID_RELEASE, hasAndroidApp } from "@/lib/android-app";

/** Who is looking: an Android phone, an iPhone/iPad, or a computer. */
type Device = "android" | "ios" | "desktop";

const KEY = "oakvale:android-prompt";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const SIZE_MB = Math.round(ANDROID_RELEASE.sizeBytes / 1024 / 1024);

function remembered(): "never" | number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "never") return "never";
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function remember(value: "never" | number) {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* private mode: the prompt just comes back next visit */
  }
}

function detect(): Device | null {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  // Inside the app (Android WebViews add "; wv)"; iOS in-app WebViews lack "Safari/") or an installed web app.
  if (/; wv\)/i.test(ua) || (ios && !/Safari\//i.test(ua))) return null;
  if (window.matchMedia("(display-mode: standalone)").matches) return null;
  return android ? "android" : ios ? "ios" : "desktop";
}

/**
 * Pop-up offering the Android app (an APK) to everyone using the website, on
 * the sign-in pages and the learner overview (/learn): a download button on
 * Android, plus a QR code to scan with an Android phone on computers. iPhone
 * and iPad visitors are told it's coming to the App Store soon. Hidden until
 * an APK has been built into public/downloads (src/lib/android-app.ts), inside
 * the app itself, and for a week after "Maybe later" (for good after "Don't
 * show again").
 */
export function AndroidAppPrompt() {
  const [device, setDevice] = useState<Device | null>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  const primaryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!hasAndroidApp) return;
    // A short delay so it doesn't land on top of the page while it loads.
    const timer = setTimeout(() => {
      const said = remembered();
      if (said === "never" || (typeof said === "number" && said > Date.now())) return;
      setDevice(detect());
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!device) return;
    (primary.current ?? primaryButton.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && later();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [device]);

  function later() {
    remember(Date.now() + SNOOZE_MS);
    setDevice(null);
  }

  function never() {
    remember("never");
    setDevice(null);
  }

  if (!device || !hasAndroidApp) return null;
  const subtitle = { android: "For Android phones", ios: "For iPhone and iPad", desktop: "For Android phones" }[device];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/40 p-3 sm:items-center" onClick={later}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="android-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-raised"
      >
        <button type="button" onClick={later} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <Image src="/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-xl" />
          <div>
            <h2 id="android-prompt-title" className="font-display text-xl text-ink-950">
              Get the Oakvale app
            </h2>
            <p className="text-sm text-ink-500">{subtitle}</p>
          </div>
        </div>

        {device === "ios" ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-700">
              The Oakvale app is coming to the App Store soon. Until then, you can keep learning right here in your browser.
            </p>
            <button ref={primaryButton} type="button" onClick={later} className={buttonClass({ variant: "primary", size: "md" }) + " mt-4 w-full justify-center"}>
              Got it
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-700">
              Open your modules straight from your home screen and keep learning on your phone.
            </p>
            {device === "desktop" && (
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-canvas p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- small SVG from our own route */}
                <img src="/api/app/android-qr" alt="QR code to download the Oakvale app" width={96} height={96} className="size-24 shrink-0 rounded-md bg-white" />
                <p className="text-xs leading-relaxed text-ink-600">
                  Scan with your Android phone&apos;s camera to download it there, or download the file here and send it to your phone.
                </p>
              </div>
            )}
            <a
              ref={primary}
              href={ANDROID_APK_PATH}
              download="Oakvale-Learning.apk"
              onClick={() => remember(Date.now() + SNOOZE_MS)}
              className={buttonClass({ variant: "primary", size: "md" }) + " mt-4 w-full justify-center"}
            >
              <Download className="size-4" /> Download the app{SIZE_MB > 0 ? ` (${SIZE_MB} MB)` : ""}
            </a>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              On your phone, open the downloaded file. If Android asks, allow installs from your browser, then tap Install.
            </p>
          </>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          {device === "ios" ? (
            <span />
          ) : (
            <button type="button" onClick={later} className="font-medium text-ink-600 hover:text-ink-900">
              Maybe later
            </button>
          )}
          <button type="button" onClick={never} className="text-ink-400 hover:text-ink-700">
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
