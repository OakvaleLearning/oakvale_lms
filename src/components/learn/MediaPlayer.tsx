"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const HEARTBEAT_MS = 15_000;
const COMPLETE_AT = 0.9; // fraction watched/listened that counts as complete
let lastRefresh = 0;

/**
 * Native video/audio player streaming from a presigned R2 URL. Saves the
 * position every 15s while playing (and on pause/leave), resumes from it, and
 * marks the lesson complete once 90% has been played.
 */
export function MediaPlayer({
  lessonId,
  kind,
  src,
  startAt,
  completed,
}: {
  lessonId: string;
  kind: "VIDEO" | "AUDIO";
  src: string;
  startAt: number;
  completed: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lastSent = useRef(0);
  const done = useRef(completed);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const send = (body: { positionSec: number; completed?: boolean }) =>
      fetch("/api/lms/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, ...body }),
        keepalive: true,
      }).catch(() => {});

    const save = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSent.current < HEARTBEAT_MS) return;
      lastSent.current = now;
      send({ positionSec: el.currentTime });
    };

    const onMeta = () => {
      if (startAt > 0 && startAt < el.duration - 5) el.currentTime = startAt;
    };
    const onTime = () => {
      if (!done.current && el.duration && el.currentTime / el.duration >= COMPLETE_AT) {
        done.current = true;
        send({ positionSec: el.currentTime, completed: true }).then(() => router.refresh());
        return;
      }
      if (!el.paused) save();
    };
    const onPause = () => save(true);
    const onLeave = () => save(true);
    // The signed media link lasts about an hour. If it has expired (e.g. the
    // learner paused for a long time), save the position and fetch a new link;
    // the player resumes from the saved position.
    const onError = () => {
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      send({ positionSec: el.currentTime }).then(() => router.refresh());
    };

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    window.addEventListener("pagehide", onLeave);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
      window.removeEventListener("pagehide", onLeave);
      if (el.currentTime > 0) send({ positionSec: el.currentTime });
    };
  }, [lessonId, startAt, router]);

  if (kind === "AUDIO") {
    return (
      <div className="card p-6">
        <audio ref={ref} src={src} controls preload="metadata" className="w-full" />
      </div>
    );
  }
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload"
      className="aspect-video w-full rounded-2xl bg-black"
    />
  );
}
