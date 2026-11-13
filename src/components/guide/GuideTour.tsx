"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Compass, MousePointerClick, X } from "lucide-react";
import { EASE } from "@/components/motion";
import { getWalkthrough, matchPath, type GuideTarget } from "@/lib/guide/walkthroughs";
import { endTour, goToStep, openGuide, useGuide } from "./store";

/**
 * Plays the active walkthrough over the real page: a spotlight on the element
 * the step is about and a card explaining what to do. The dimming never
 * blocks clicks, so the learner or admin does each step themselves.
 */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Elements a text target can name, in order of preference. */
const LABELLED = "button, a, summary, [role=tab], label, legend, h1, h2, h3, h4";
const PAD = 6;

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function visible(el: Element): boolean {
  if (el.closest("[data-guide-ui]")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function firstVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) if (visible(el)) return el;
  return null;
}

function byText(text: string): Element | null {
  const want = norm(text).toLowerCase();
  const labelled = [...document.querySelectorAll(LABELLED)].filter(visible);
  const textOf = (el: Element) => norm(el.textContent).toLowerCase();
  const found =
    labelled.find((el) => textOf(el) === want) ??
    labelled.find((el) => (el.matches("button, a, summary") ? textOf(el).startsWith(want) : false));
  if (found) return found;
  // A short label in a plain element (e.g. "Resume lesson" inside a card link).
  for (const el of document.querySelectorAll("span, div, p, dt")) {
    if (el.children.length <= 2 && textOf(el) === want && visible(el)) return el.closest("a, button") ?? el;
  }
  return null;
}

function resolve(target: GuideTarget): { el: Element | null; viaMenu: boolean } {
  if ("nav" in target) {
    const el = firstVisible(`[data-guide-nav="${CSS.escape(target.nav)}"]`);
    if (el) return { el, viaMenu: false };
    return { el: firstVisible('[data-guide="menu"]'), viaMenu: true };
  }
  if ("selector" in target) return { el: firstVisible(target.selector), viaMenu: false };
  const el = byText(target.text);
  return { el: (target.closest && el?.closest(target.closest)) || el, viaMenu: false };
}

interface Found {
  key: string;
  el: Element | null;
  box: Box | null;
  viaMenu: boolean;
}

function sameBox(a: Box | null, b: Box | null) {
  return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
}

export function GuideTour() {
  const { tour } = useGuide();
  const pathname = usePathname();
  const router = useRouter();
  const walkthrough = tour ? getWalkthrough(tour.id) : undefined;
  const index = tour?.step ?? 0;
  const step = walkthrough?.steps[index];
  const total = walkthrough?.steps.length ?? 0;

  const [found, setFound] = useState<Found | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [card, setCard] = useState({ w: 340, h: 200 });
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const cardRef = useRef<HTMLDivElement>(null);

  const onPage = !step?.path || matchPath(step.path, pathname);
  // Everything measured belongs to one step on one page; stale values are ignored.
  const stepKey = `${tour?.id}:${index}:${pathname}`;
  const current = found?.key === stepKey && onPage ? found : null;
  const box = current?.box ?? null;
  const viaMenu = current?.viaMenu ?? false;
  const settled = settledKey === stepKey;

  // When the page changes, move the tour to the step for this page (forwards first, then back).
  useEffect(() => {
    if (!walkthrough || !step) return;
    const steps = walkthrough.steps;
    if (step.target && "nav" in step.target && pathname === step.target.nav && index < total - 1) {
      goToStep(index + 1);
      return;
    }
    if (!step.path || matchPath(step.path, pathname)) return;
    const matches = (i: number) => !!steps[i].path && matchPath(steps[i].path!, pathname);
    for (let i = index + 1; i < steps.length; i++) if (matches(i)) return goToStep(i);
    for (let i = index - 1; i >= 0; i--) if (matches(i)) return goToStep(i);
    // Only on navigation; a step change alone must not re-route the tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, walkthrough]);

  // Give navigation and dialogs a moment before saying something is missing.
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(stepKey), 1200);
    return () => clearTimeout(t);
  }, [stepKey]);

  // Follow the target as the page scrolls, resizes or re-renders.
  useEffect(() => {
    if (!step || !onPage) return;
    let scrolledTo: Element | null = null;
    const tick = () => {
      setViewport((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const { el, viaMenu: menu } = step.target ? resolve(step.target) : { el: null, viaMenu: false };
      let next: Box | null = null;
      if (el) {
        if (el !== scrolledTo) {
          scrolledTo = el;
          const r = el.getBoundingClientRect();
          if (r.top < 64 || r.bottom > window.innerHeight - 24) {
            el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
          }
        }
        const r = el.getBoundingClientRect();
        next = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      }
      setFound((prev) =>
        prev && prev.key === stepKey && prev.el === el && prev.viaMenu === menu && sameBox(prev.box, next)
          ? prev
          : { key: stepKey, el, box: next, viaMenu: menu }
      );
    };
    tick();
    const timer = setInterval(tick, 150);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
    };
  }, [step, onPage, stepKey]);

  // Steps that open a dialog or a page move on when the highlighted element is clicked.
  const el = current?.el ?? null;
  useEffect(() => {
    if (!el || !step?.advanceOnClick || viaMenu) return;
    const onClick = () => setTimeout(() => (index + 1 < total ? goToStep(index + 1) : endTour()), 60);
    el.addEventListener("click", onClick, { capture: true, once: true });
    return () => el.removeEventListener("click", onClick, { capture: true });
  }, [el, step, viaMenu, index, total]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const measure = () => setCard((c) => (c.w === node.offsetWidth && c.h === node.offsetHeight ? c : { w: node.offsetWidth, h: node.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  });

  if (!walkthrough || !step || typeof document === "undefined") return null;

  const last = index === total - 1;
  const showOffPage = !onPage && settled;
  const missing = !!step.target && !box && onPage && settled;
  if (!onPage && !settled) return null;

  const next = () => (last ? endTour() : goToStep(index + 1));
  const back = () => goToStep(Math.max(0, index - 1));
  const staticPath = step.path && !step.path.includes("*") ? step.path : null;

  return createPortal(
    <div data-guide-ui className="pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
      <AnimatePresence>
        {box && (
          <motion.div
            key="spotlight"
            className="absolute rounded-xl ring-2 ring-gold-light"
            style={{ boxShadow: "0 0 0 9999px rgb(10 30 22 / 0.42)" }}
            initial={{ opacity: 0, top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
            animate={{ opacity: 1, top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {(step.advanceOnClick || viaMenu) && (
              <motion.span
                className="absolute inset-0 rounded-xl ring-4 ring-gold-light/60"
                animate={{ opacity: [0.9, 0], scale: [1, 1.08] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-label={`Walkthrough: ${walkthrough.title}`}
        className="pointer-events-auto absolute w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-5 shadow-raised"
        initial={false}
        animate={placeCard(box, card, viewport)}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="eyebrow flex min-w-0 items-center gap-1.5 text-ink-500!">
            <Compass className="size-3.5 shrink-0 text-primary-600" />
            <span className="truncate">{walkthrough.title}</span>
          </div>
          <button
            onClick={endTour}
            className="-mr-1.5 -mt-1.5 grid size-7 shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
            aria-label="End walkthrough"
          >
            <X className="size-4" />
          </button>
        </div>

        {showOffPage ? (
          <>
            <h2 className="mt-2 text-[15px] font-semibold text-ink-950">This step is on another page</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
              Next up: <span className="font-medium text-ink-800">{step.title}</span>.{" "}
              {staticPath ? "I can take you there." : "Go back to where you were, or start the walkthrough again."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => goToStep(0)} className="h-9 rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-100">
                Start again
              </button>
              {staticPath && (
                <button
                  onClick={() => router.push(staticPath)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                >
                  Take me there <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-[15px] font-semibold text-ink-950">{step.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
            {viaMenu && box && (
              <p className="mt-2 rounded-lg bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-800">
                Tap the menu button to open the sidebar first.
              </p>
            )}
            {step.advanceOnClick && box && !viaMenu && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-700">
                <MousePointerClick className="size-3.5" /> Click the highlighted item to continue
              </p>
            )}
            {missing && (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                I can&apos;t spot this on screen. It may be further down the page, appear after the previous step, or not
                apply to your account yet.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-ink-400">
                Step {index + 1} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                {index > 0 && (
                  <button
                    onClick={back}
                    className="grid size-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                    aria-label="Previous step"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                {last && (
                  <button onClick={() => (endTour(), openGuide())} className="h-9 rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-100">
                    Ask something else
                  </button>
                )}
                <button
                  onClick={next}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                >
                  {last ? "Done" : step.advanceOnClick && box ? "Skip" : "Next"}
                  {!last && <ArrowRight className="size-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

/** Put the card beside the spotlight without covering it; docked at the bottom when there's nothing to point at. */
function placeCard(box: Box | null, card: { w: number; h: number }, vp: { w: number; h: number }) {
  const gap = 14;
  const edge = 16;
  const clampX = (x: number) => Math.min(Math.max(x, edge), vp.w - card.w - edge);
  const clampY = (y: number) => Math.min(Math.max(y, edge), vp.h - card.h - edge);
  const docked = { top: vp.h - card.h - 24, left: clampX((vp.w - card.w) / 2) };
  if (!box) return docked;

  if (vp.w < 640) {
    const targetLow = box.top + box.height / 2 > vp.h / 2;
    return { top: targetLow ? edge : vp.h - card.h - edge, left: edge };
  }
  const centredX = clampX(box.left + box.width / 2 - card.w / 2);
  if (box.top + box.height + PAD + gap + card.h < vp.h - edge) return { top: box.top + box.height + PAD + gap, left: centredX };
  if (box.top - PAD - gap - card.h > edge) return { top: box.top - PAD - gap - card.h, left: centredX };
  if (box.left - PAD - gap - card.w > edge) return { top: clampY(box.top), left: box.left - PAD - gap - card.w };
  if (box.left + box.width + PAD + gap + card.w < vp.w - edge) return { top: clampY(box.top), left: box.left + box.width + PAD + gap };
  return docked;
}
