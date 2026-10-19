"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type ScormApi = {
  loadFromJSON(json: Record<string, unknown>): void;
  lmsCommit(parameter?: string): string;
  isInitialized(): boolean;
};

declare global {
  interface Window {
    API?: unknown;
    API_1484_11?: unknown;
  }
}

/**
 * Hosts a SCORM 1.2 / 2004 package. scorm-again provides the runtime API on
 * this window (window.API / window.API_1484_11); the package, loaded in a
 * same-origin iframe, finds it via window.parent. Every commit is POSTed to
 * /api/lms/scorm/<lessonId>, which saves the cmi and updates progress.
 */
export function ScormPlayer({
  lessonId,
  version,
  src,
  initialCmi,
}: {
  lessonId: string;
  version: "1.2" | "2004";
  src: string;
  initialCmi: Record<string, unknown>;
}) {
  const [ready, setReady] = useState(false);
  // Loaded once per lesson; a later re-render must not restart the package.
  const initial = useRef(initialCmi);

  useEffect(() => {
    let api: ScormApi | null = null;
    let cancelled = false;

    (async () => {
      const settings = {
        lmsCommitUrl: `/api/lms/scorm/${lessonId}`,
        dataCommitFormat: "json" as const,
        autocommit: true,
        autocommitSeconds: 30,
        alwaysSendTotalTime: true,
        logLevel: 4 as const, // errors only
      };
      if (version === "1.2") {
        const { Scorm12API } = await import("scorm-again/scorm12");
        api = new Scorm12API(settings) as unknown as ScormApi;
      } else {
        const { Scorm2004API } = await import("scorm-again/scorm2004");
        api = new Scorm2004API(settings) as unknown as ScormApi;
      }
      if (cancelled) return;
      api.loadFromJSON(initial.current);
      if (version === "1.2") window.API = api;
      else window.API_1484_11 = api;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      // Flush whatever the package hasn't committed yet when leaving the lesson.
      try {
        if (api?.isInitialized()) api.lmsCommit();
      } catch {
        /* package may already have terminated */
      }
      delete window.API;
      delete window.API_1484_11;
    };
  }, [lessonId, version]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-ink-100 bg-white sm:aspect-video">
      {ready ? (
        <iframe
          src={src}
          title="Lesson content"
          className="absolute inset-0 size-full"
          allow="fullscreen; autoplay"
          allowFullScreen
        />
      ) : (
        <div className="grid size-full place-items-center">
          <Loader2 className="size-8 animate-spin text-primary-600" />
        </div>
      )}
    </div>
  );
}
