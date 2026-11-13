"use client";

import { useSyncExternalStore } from "react";
import { getWalkthrough, startStep } from "@/lib/guide/walkthroughs";

/**
 * Client state for the Oakvale Guide: whether its panel is open and which
 * walkthrough is playing. The tour is kept in sessionStorage so it carries on
 * across page loads and between the dashboard and checkout layouts.
 */

export interface TourState {
  id: string;
  step: number;
}

interface GuideState {
  panelOpen: boolean;
  tour: TourState | null;
}

const TOUR_KEY = "oakvale-guide-tour";
const SERVER: GuideState = { panelOpen: false, tour: null };

let state: GuideState | null = null;
const listeners = new Set<() => void>();

function read(): GuideState {
  if (state) return state;
  let tour: TourState | null = null;
  try {
    const raw = sessionStorage.getItem(TOUR_KEY);
    const saved = raw ? (JSON.parse(raw) as TourState) : null;
    if (saved && getWalkthrough(saved.id)) tour = saved;
  } catch {}
  state = { panelOpen: false, tour };
  return state;
}

function write(next: Partial<GuideState>) {
  state = { ...read(), ...next };
  if ("tour" in next) {
    try {
      if (state.tour) sessionStorage.setItem(TOUR_KEY, JSON.stringify(state.tour));
      else sessionStorage.removeItem(TOUR_KEY);
    } catch {}
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGuide(): GuideState {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

export const openGuide = () => write({ panelOpen: true });
export const closeGuide = () => write({ panelOpen: false });

/** Start a walkthrough, skipping ahead if the user is already partway along it. */
export function startTour(id: string) {
  const walkthrough = getWalkthrough(id);
  if (!walkthrough) return;
  write({ panelOpen: false, tour: { id, step: startStep(walkthrough, window.location.pathname) } });
}

export function goToStep(step: number) {
  const tour = read().tour;
  if (tour) write({ tour: { ...tour, step } });
}

export const endTour = () => write({ tour: null });
