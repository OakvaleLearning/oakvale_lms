"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";

type Platform = "android" | "ios";
import { buttonClass } from "@/components/ui/Button";

const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL;
const KEY = "oakvale:android-prompt";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Bottom-sheet prompt asking Android visitors to download the app (an APK);
 * iPhone and iPad visitors are told it's coming to the App Store soon.
 * Shown on the sign-in pages and the learner overview (/learn). Does nothing
 * unless NEXT_PUBLIC_ANDROID_APK_URL is set (the launch switch for both). Not
 * shown on other devices, inside the installed app or a web view, or after
 * someone said no.
 */
export function AndroidAppPrompt() {
  const [open, setOpen] = useState<Platform | null>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  const primaryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!APK_URL) return;
    // A short delay so it doesn't land on top of the page while it loads.
    const timer = setTimeout(() => {
      const ua = navigator.userAgent;
      const android = /Android/i.test(ua);
      // iPadOS reports itself as a Mac; touch support gives it away.
      const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
      // Android WebViews add "; wv)"; iOS in-app WebViews lack "Safari/".
      const webView = /; wv\)/i.test(ua) || (ios && !/Safari\//i.test(ua));
      const installed = window.matchMedia("(display-mode: standalone)").matches;
      const said = remembered();
      if ((!android && !ios) || webView || installed || said === "never" || (typeof said === "number" && said > Date.now())) return;
      setOpen(android ? "android" : "ios");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    (primary.current ?? primaryButton.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && later();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function later() {
    remember(Date.now() + SNOOZE_MS);
    setOpen(null);
  }

  function never() {
    remember("never");
    setOpen(null);
  }

  if (!open || !APK_URL) return null;
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
            <p className="text-sm text-ink-500">{open === "android" ? "For Android phones" : "For iPhone and iPad"}</p>
          </div>
        </div>
        {open === "android" ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-700">
              Open your modules straight from your home screen and keep learning on your phone.
            </p>
            <a ref={primary} href={APK_URL} onClick={() => remember(Date.now() + SNOOZE_MS)} className={buttonClass({ variant: "primary", size: "md" }) + " mt-4 w-full justify-center"}>
              <Download className="size-4" /> Download for Android
            </a>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              When the download finishes, open the file. If Android asks, allow installs from your browser, then tap Install.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-700">
              The Oakvale app is coming to the App Store soon. Until then, you can keep learning right here in your browser.
            </p>
            <button ref={primaryButton} type="button" onClick={later} className={buttonClass({ variant: "primary", size: "md" }) + " mt-4 w-full justify-center"}>
              Got it
            </button>
          </>
        )}
        <div className="mt-3 flex items-center justify-between text-xs">
          {open === "android" ? (
            <button type="button" onClick={later} className="font-medium text-ink-600 hover:text-ink-900">
              Maybe later
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={never} className="text-ink-400 hover:text-ink-700">
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
