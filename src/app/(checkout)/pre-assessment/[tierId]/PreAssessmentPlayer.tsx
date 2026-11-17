"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Clock, Loader2, Maximize, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isAnswered, QuestionCard } from "@/components/learn/QuestionCard";
import type { LearnerQuestion } from "@/lib/lms/quiz";
import { HEARTBEAT_MS, PROCTOR_EVENTS, SNAPSHOT_EVERY_MS, type ClientEventType } from "@/lib/lms/proctoring";
import { cn } from "@/lib/utils";
import { startPreAssessment, submitPreAssessment } from "./actions";

/* ------------------------------------------------------------------ *
 * Browser helpers
 * ------------------------------------------------------------------ */

/** Whether the page is full screen, or can't be (e.g. iPhone Safari), in which case it isn't required. */
function useFullscreenOk() {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    },
    () => !document.fullscreenEnabled || Boolean(document.fullscreenElement),
    () => true
  );
}

function enterFullscreen() {
  if (!document.fullscreenEnabled || document.fullscreenElement) return Promise.resolve();
  return document.documentElement.requestFullscreen({ navigationUI: "hide" });
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

const openCamera = () =>
  navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
    audio: false,
  });

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */

/**
 * Answers one pre-assessment attempt under proctoring: full screen, one
 * window, no copy/paste, camera on with periodic stills, and a countdown.
 * Answers autosave with every check-in; the server ends the attempt when time
 * or strikes run out, and the page shows the result after it re-renders.
 */
export function PreAssessmentPlayer({
  tierId,
  attemptId,
  questions,
  savedAnswers,
  deadline,
  serverNow,
  proctored,
  webcam,
  maxStrikes,
  strikes: initialStrikes,
}: {
  tierId: string;
  attemptId: string;
  questions: LearnerQuestion[];
  savedAnswers: Record<string, string[]>;
  deadline: string | null;
  serverNow: number;
  proctored: boolean;
  webcam: boolean;
  maxStrikes: number;
  strikes: number;
}) {
  const router = useRouter();
  const [clientId] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState(savedAnswers);
  const [strikes, setStrikes] = useState(initialStrikes);
  const [warning, setWarning] = useState<string | null>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">(webcam ? "starting" : "on");
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fullscreenOk = useFullscreenOk();

  const answersRef = useRef(savedAnswers);
  const dirty = useRef(false);
  const queue = useRef<ClientEventType[]>([]);
  const done = useRef(false);
  const lastAway = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoSubmitted = useRef(false);

  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;

  /** Stop proctoring and show the result. */
  const end = useCallback(() => {
    done.current = true;
    stopStream(streamRef.current);
    exitFullscreen();
    router.refresh();
  }, [router]);

  /** Check in: autosave answers and report events. */
  const send = useCallback(
    async (keepalive = false) => {
      if (done.current) return;
      const events = queue.current.splice(0);
      const body = { attemptId, clientId, events, ...(dirty.current ? { answers: answersRef.current } : {}) };
      dirty.current = false;
      try {
        const res = await fetch("/api/pre-assessment/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive,
        });
        const json = await res.json();
        if (json.ok && json.ended) end();
        else if (json.ok) setStrikes(json.strikes);
      } catch {
        // Offline: keep what wasn't delivered for the next check-in.
        queue.current.unshift(...events);
        if (body.answers) dirty.current = true;
      }
    },
    [attemptId, clientId, end]
  );

  const record = useCallback(
    (type: ClientEventType) => {
      if (done.current) return;
      // Switching away fires both blur and visibilitychange: count it once.
      if (type === "HIDDEN" || type === "BLUR") {
        const now = Date.now();
        if (now - lastAway.current < 2000) return;
        lastAway.current = now;
      }
      queue.current.push(type);
      if (PROCTOR_EVENTS[type].strike) setWarning(PROCTOR_EVENTS[type].label);
      void send(type === "HIDDEN");
    },
    [send]
  );

  // Heartbeat: register this window straight away (noting anything odd about the setup), then every few seconds.
  useEffect(() => {
    if (proctored && !document.fullscreenEnabled) queue.current.push("NO_FULLSCREEN");
    if (proctored && (window.screen as Screen & { isExtended?: boolean }).isExtended) queue.current.push("SECOND_SCREEN");
    void send();
    const id = setInterval(() => void send(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [send, proctored]);

  // Countdown against the server's clock.
  useEffect(() => {
    if (!deadline) return;
    const skew = serverNow - Date.now();
    const end = new Date(deadline).getTime();
    const tick = () => setLeft(end - (Date.now() + skew));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, serverNow]);

  // Proctoring: leaving the page, full screen, copy/paste and blocked keys.
  useEffect(() => {
    if (!proctored) return;
    const onVisibility = () => document.visibilityState === "hidden" && record("HIDDEN");
    const onBlur = () => record("BLUR");
    const onFullscreen = () => !document.fullscreenElement && record("FULLSCREEN_EXIT");
    const block = (type: ClientEventType) => (e: Event) => {
      e.preventDefault();
      record(type);
    };
    const onCopy = block("COPY");
    const onCut = block("CUT");
    const onPaste = block("PASTE");
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (
        k === "printscreen" ||
        k === "f12" ||
        (mod && ["p", "s", "u"].includes(k)) ||
        (mod && e.shiftKey && ["i", "j", "c"].includes(k))
      ) {
        e.preventDefault();
        record("SHORTCUT");
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!done.current) e.preventDefault();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [proctored, record]);

  const attachCamera = useCallback(() => {
    openCamera()
      .then((stream) => {
        if (done.current) return stopStream(stream);
        stopStream(streamRef.current);
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          record("CAMERA_OFF");
          setCamera("off");
        });
        setCamera("on");
      })
      .catch(() => setCamera("off"));
  }, [record]);

  function retryCamera() {
    setCamera("starting");
    attachCamera();
  }

  // Webcam: on for the whole attempt, with a still now and then for review.
  useEffect(() => {
    if (!webcam) return;
    attachCamera();
    const snap = () => {
      const video = videoRef.current;
      if (done.current || !video || !video.videoWidth || !streamRef.current?.active) return;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.round((320 * video.videoHeight) / video.videoWidth);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.6);
      void fetch("/api/pre-assessment/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, image }),
      }).catch(() => {});
    };
    const first = setTimeout(snap, 5000);
    const id = setInterval(snap, SNAPSHOT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [webcam, attemptId, attachCamera]);

  const submit = useCallback(
    (force: boolean) => {
      if (!force && answered < questions.length) {
        setError("Please answer every question.");
        return;
      }
      if (done.current) return;
      setError("");
      startTransition(async () => {
        await send();
        if (done.current) return;
        done.current = true; // the page is about to change: stop recording
        const res = await submitPreAssessment(tierId, attemptId, { clientId, answers: answersRef.current });
        if (!res.ok) {
          done.current = false;
          setError(res.error);
          return;
        }
        end();
        window.scrollTo({ top: 0 });
      });
    },
    [answered, questions.length, send, tierId, attemptId, clientId, end]
  );

  // Time's up: submit whatever is answered (the server would close it anyway).
  useEffect(() => {
    if (left !== null && left <= 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      submit(true);
    }
  }, [left, submit]);

  function change(id: string, value: string[]) {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    dirty.current = true;
    setAnswers(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  const blockedBy = proctored && !fullscreenOk ? "fullscreen" : webcam && camera !== "on" ? "camera" : null;
  const lowTime = left !== null && left < 5 * 60_000;

  return (
    <div className={cn(proctored && "select-none")}>
      {/* Status bar */}
      <div className="sticky top-0 z-30 -mx-4 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-white/95 px-4 py-3 text-sm backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        {left !== null && (
          <span className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", lowTime ? "text-accent-700" : "text-ink-900")}>
            <Clock className="size-4" /> {formatClock(left)}
          </span>
        )}
        <span className="text-ink-600">
          <span className="font-medium tabular-nums text-ink-950">{answered}</span> of {questions.length} answered
        </span>
        {proctored && (
          <span className={cn("inline-flex items-center gap-1.5", strikes > 0 ? "text-accent-700" : "text-ink-600")}>
            <ShieldCheck className="size-4" />
            {maxStrikes > 0 ? `${strikes} of ${maxStrikes} strikes` : `${strikes} ${strikes === 1 ? "strike" : "strikes"}`}
          </span>
        )}
        <span className="ml-auto text-xs text-ink-500">Answers save automatically</span>
      </div>

      {warning && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Strike recorded:</span> {warning}.{" "}
            {maxStrikes > 0
              ? strikes >= maxStrikes - 1
                ? "One more and your attempt ends as a fail."
                : `Your attempt ends as a fail at ${maxStrikes} strikes.`
              : "It will be reviewed with your result."}
          </p>
          <button type="button" onClick={() => setWarning(null)} aria-label="Dismiss" className="text-accent-700 hover:text-accent-900">
            <X className="size-4" />
          </button>
        </div>
      )}

      {blockedBy ? (
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          {blockedBy === "fullscreen" ? (
            <>
              <Maximize className="size-8 text-ink-400" />
              <div>
                <p className="font-semibold text-ink-950">Return to full screen to continue</p>
                <p className="mt-1 text-sm text-ink-600">The timer is still running.</p>
              </div>
              <Button type="button" onClick={() => enterFullscreen().catch(() => {})}>
                Go full screen
              </Button>
            </>
          ) : (
            <>
              <Camera className="size-8 text-ink-400" />
              <div>
                <p className="font-semibold text-ink-950">
                  {camera === "starting" ? "Starting your camera…" : "Your camera needs to be on"}
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  {camera === "starting"
                    ? "Allow camera access if your browser asks."
                    : "Allow camera access for this site in your browser, then try again. The timer is still running."}
                </p>
              </div>
              {camera === "off" && (
                <Button type="button" onClick={retryCamera}>
                  Turn camera on
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              total={questions.length}
              value={answers[q.id]}
              disabled={pending}
              onChange={(value) => change(q.id, value)}
            />
          ))}

          {error && <p className="text-sm text-accent-600">{error}</p>}

          <div className="z-30 flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/95 p-3 pl-5 shadow-raised backdrop-blur sm:sticky sm:bottom-4">
            <span className="text-sm text-ink-600">
              <span className="font-medium tabular-nums text-ink-950">{answered}</span> of {questions.length} answered
            </span>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Submit answers
            </Button>
          </div>
        </form>
      )}

      {webcam && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Your camera"
          className={cn(
            "fixed right-4 bottom-4 z-40 w-28 -scale-x-100 rounded-xl border border-line bg-ink-900 shadow-raised sm:w-36",
            camera !== "on" && "opacity-0"
          )}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

/**
 * Agree to the rules, check the camera, go full screen and start. Full screen
 * has to be requested from the click itself, so this runs in the browser.
 */
export function StartAssessment({
  tierId,
  label,
  proctored,
  webcam,
}: {
  tierId: string;
  label: string;
  proctored: boolean;
  webcam: boolean;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(!proctored && !webcam);
  const [camera, setCamera] = useState<"idle" | "starting" | "on" | "off">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => stopStream(streamRef.current), []);

  function checkCamera() {
    setCamera("starting");
    openCamera()
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("on");
      })
      .catch(() => setCamera("off"));
  }

  async function start() {
    setError("");
    if (proctored) {
      try {
        await enterFullscreen();
      } catch {
        setError("Allow full screen to start the assessment.");
        return;
      }
    }
    startTransition(async () => {
      const res = await startPreAssessment(tierId);
      if (!res.ok) {
        exitFullscreen();
        setError(res.error);
        return;
      }
      stopStream(streamRef.current);
      router.refresh();
    });
  }

  const ready = agreed && (!webcam || camera === "on");

  return (
    <div className="space-y-4">
      {webcam && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={cn("w-32 -scale-x-100 rounded-lg bg-ink-900", camera !== "on" && "hidden")}
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-ink-900">{camera === "on" ? "Camera is working" : "Check your camera"}</p>
            <p className="mt-0.5 text-ink-500">
              {camera === "off"
                ? "We couldn't open your camera. Allow camera access for this site in your browser, then try again."
                : camera === "on"
                  ? "Keep your face in view for the whole assessment."
                  : "Your camera stays on during the assessment."}
            </p>
          </div>
          {camera !== "on" && (
            <Button type="button" variant="outline" size="sm" onClick={checkCamera} disabled={camera === "starting"}>
              {camera === "starting" && <Loader2 className="size-4 animate-spin" />}
              {camera === "off" ? "Try again" : "Turn on camera"}
            </Button>
          )}
        </div>
      )}

      {(proctored || webcam) && (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary-600"
          />
          <span>
            I&apos;ll take this assessment alone, without notes or help, and I agree to it being monitored
            {webcam ? ", including photos from my camera" : ""}.
          </span>
        </label>
      )}

      {error && <p className="text-sm text-accent-600">{error}</p>}

      <Button type="button" size="lg" onClick={start} disabled={!ready || pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
