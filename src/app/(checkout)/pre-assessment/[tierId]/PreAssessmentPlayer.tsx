"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Clock, Loader2, Maximize, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isAnswered, QuestionCard } from "@/components/learn/QuestionCard";
import type { AttemptView } from "@/lib/lms/pre-assessment";
import { HEARTBEAT_MS, PROCTOR_EVENTS, SNAPSHOT_EVERY_MS, type ClientEventType } from "@/lib/lms/proctoring";
import { cn } from "@/lib/utils";
import { advancePreAssessment, currentPreAssessmentQuestion, startPreAssessment } from "./actions";

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
 * Answers one pre-assessment attempt, one question at a time with no way
 * back, under proctoring: full screen, one window, no copy/paste, camera on
 * with periodic stills, the overall countdown and (optionally) one per
 * question. The current answer autosaves with every check-in. The server
 * decides which question is current and ends the attempt when time or
 * strikes run out; the page shows the result after it re-renders.
 */
export function PreAssessmentPlayer({
  tierId,
  initial,
  proctored,
  webcam,
  maxStrikes,
  secondsPerQuestion,
}: {
  tierId: string;
  initial: AttemptView;
  proctored: boolean;
  webcam: boolean;
  maxStrikes: number;
  secondsPerQuestion: number | null;
}) {
  const router = useRouter();
  const [clientId] = useState(() => crypto.randomUUID());
  const [view, setView] = useState(initial);
  const [answer, setAnswer] = useState<string[]>(initial.answer);
  const [strikes, setStrikes] = useState(initial.strikes);
  const [warning, setWarning] = useState<string | null>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">(webcam ? "starting" : "on");
  const [left, setLeft] = useState<number | null>(null);
  const [questionLeft, setQuestionLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fullscreenOk = useFullscreenOk();

  const viewRef = useRef(initial);
  const answerRef = useRef(initial.answer);
  const dirty = useRef(false);
  const queue = useRef<ClientEventType[]>([]);
  const done = useRef(false);
  const advancing = useRef(false);
  const lastAway = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isLast = view.index >= view.total - 1;
  const answered = view.question ? isAnswered(view.question, answer) : true;

  /** Stop proctoring and show the result. */
  const end = useCallback(() => {
    done.current = true;
    stopStream(streamRef.current);
    exitFullscreen();
    router.refresh();
  }, [router]);

  /** Show the next question the server sent. */
  const show = useCallback((next: AttemptView) => {
    viewRef.current = next;
    answerRef.current = next.answer;
    dirty.current = false;
    advancing.current = false;
    setView(next);
    setAnswer(next.answer);
    setError("");
    window.scrollTo({ top: 0 });
  }, []);

  /** The server moved on without us (this question's time ran out): catch up. */
  const resync = useCallback(async () => {
    const next = await currentPreAssessmentQuestion(viewRef.current.attemptId);
    if (next) show(next);
    else end();
  }, [show, end]);

  /** Check in: autosave the current answer and report events. */
  const send = useCallback(
    async (keepalive = false) => {
      if (done.current) return;
      const events = queue.current.splice(0);
      const current = viewRef.current;
      const body = {
        attemptId: current.attemptId,
        clientId,
        events,
        ...(dirty.current ? { answers: { [current.questionId]: answerRef.current } } : {}),
      };
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
        else if (json.ok) {
          setStrikes(json.strikes);
          if (json.index !== viewRef.current.index && !advancing.current) await resync();
        }
      } catch {
        // Offline: keep what wasn't delivered for the next check-in.
        queue.current.unshift(...events);
        if (body.answers) dirty.current = true;
      }
    },
    [clientId, end, resync]
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

  /** Lock in this question's answer and move on. On the last question this submits the attempt. */
  const advance = useCallback(() => {
    if (advancing.current || done.current) return;
    advancing.current = true;
    const current = viewRef.current;
    const last = current.index >= current.total - 1;
    startTransition(async () => {
      await send();
      if (done.current) return;
      if (last) done.current = true; // the page is about to change: stop recording
      const res = await advancePreAssessment(tierId, current.attemptId, {
        clientId,
        questionId: current.questionId,
        answer: answerRef.current,
      });
      if (!res.ok) {
        done.current = false;
        advancing.current = false;
        setError(res.error);
        return;
      }
      if (res.ended) end();
      else show(res.view);
    });
  }, [send, tierId, clientId, end, show]);

  // Heartbeat: register this window straight away (noting anything odd about the setup), then every few seconds.
  useEffect(() => {
    if (proctored && !document.fullscreenEnabled) queue.current.push("NO_FULLSCREEN");
    if (proctored && (window.screen as Screen & { isExtended?: boolean }).isExtended) queue.current.push("SECOND_SCREEN");
    void send();
    const id = setInterval(() => void send(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [send, proctored]);

  // Countdowns against the server's clock: the whole attempt, and this question.
  useEffect(() => {
    const skew = view.serverNow - Date.now();
    const deadline = view.deadline ? new Date(view.deadline).getTime() : null;
    const questionDeadline = view.questionDeadline ? new Date(view.questionDeadline).getTime() : null;
    let closing = false;
    const tick = () => {
      const now = Date.now() + skew;
      if (deadline !== null) {
        setLeft(deadline - now);
        // Time's up: the server closes the attempt on the next check-in.
        if (deadline - now <= 0 && !closing) {
          closing = true;
          void send();
        }
      }
      if (questionDeadline !== null) {
        setQuestionLeft(questionDeadline - now);
        // This question's time is up: move on with whatever is chosen.
        if (questionDeadline - now <= 0) advance();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [view, send, advance]);

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
  const attemptId = initial.attemptId;
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

  function change(value: string[]) {
    answerRef.current = value;
    dirty.current = true;
    setAnswer(value);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!answered) {
      setError("Choose an answer, or skip this question.");
      return;
    }
    advance();
  }

  const blockedBy = proctored && !fullscreenOk ? "fullscreen" : webcam && camera !== "on" ? "camera" : null;
  const lowTime = left !== null && left < 5 * 60_000;
  const questionShare =
    questionLeft !== null && secondsPerQuestion ? Math.max(0, Math.min(1, questionLeft / (secondsPerQuestion * 1000))) : null;

  return (
    <div className={cn(proctored && "select-none")}>
      {/* Status bar */}
      <div className="sticky top-0 z-30 -mx-4 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-white/95 px-4 py-3 text-sm backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <span className="font-medium text-ink-950">
          Question <span className="tabular-nums">{view.index + 1}</span> of <span className="tabular-nums">{view.total}</span>
        </span>
        {left !== null && (
          <span className={cn("inline-flex items-center gap-1.5 tabular-nums", lowTime ? "font-medium text-accent-700" : "text-ink-700")}>
            <Clock className="size-4" /> {formatClock(left)} left
          </span>
        )}
        {proctored && (
          <span className={cn("inline-flex items-center gap-1.5", strikes > 0 ? "text-accent-700" : "text-ink-600")}>
            <ShieldCheck className="size-4" />
            {maxStrikes > 0 ? `${strikes} of ${maxStrikes} strikes` : `${strikes} ${strikes === 1 ? "strike" : "strikes"}`}
          </span>
        )}
        <span className="ml-auto text-xs text-ink-500">No going back</span>
        {/* Progress through the questions */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink-100" aria-hidden>
          <div className="h-full rounded-full bg-primary-500 transition-[width]" style={{ width: `${(view.index / view.total) * 100}%` }} />
        </div>
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
          {questionShare !== null && questionLeft !== null && (
            <div className="flex items-center gap-3 text-sm" role="timer" aria-live="off">
              <span className={cn("w-20 shrink-0 font-medium tabular-nums", questionLeft < 10_000 ? "text-accent-700" : "text-ink-800")}>
                {formatClock(questionLeft)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500 ease-linear", questionLeft < 10_000 ? "bg-accent-500" : "bg-primary-500")}
                  style={{ width: `${questionShare * 100}%` }}
                />
              </div>
              <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">for this question</span>
            </div>
          )}

          {view.question ? (
            <QuestionCard
              key={view.questionId}
              question={view.question}
              index={view.index}
              total={view.total}
              value={answer}
              disabled={pending}
              onChange={change}
            />
          ) : (
            <div className="card p-6 text-sm text-ink-600">This question is no longer available. Move on to the next one.</div>
          )}

          {error && <p className="text-sm text-accent-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 pl-5 shadow-card">
            <span className="text-xs text-ink-500">
              {isLast ? "This is the last question." : "Once you move on, you can't come back to this question."}
            </span>
            <div className="flex items-center gap-2">
              {!answered && (
                <Button type="button" variant="ghost" onClick={advance} disabled={pending}>
                  Skip
                </Button>
              )}
              <Button type="submit" disabled={pending || !answered}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {isLast ? "Finish and submit" : "Next question"}
              </Button>
            </div>
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
