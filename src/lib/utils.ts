import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an amount stored in kobo (NGN * 100) as a Naira string. */
export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

/** Format a plain Naira number (not kobo). */
export function formatNairaPlain(naira: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(naira);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Format a date as a plain day (no time), e.g. "12 Aug 2026". */
export function formatDay(date: Date | string): string {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
    new Date(date)
  );
}

/** Turn a title into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Normalise a phone number to E.164-ish form for WhatsApp links. Local
 * Nigerian numbers ("0810 818 9514") become "+2348108189514"; numbers already
 * carrying a country code are kept as-is minus the formatting characters.
 */
export function normalizePhone(input: string): string {
  const raw = input.trim().replace(/[\s()\-.]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.startsWith("234")) return `+${digits}`;
  return `+${digits}`;
}

/** wa.me chat link for a stored phone number. */
export function whatsappLink(phone: string): string {
  return `https://wa.me/${normalizePhone(phone).replace(/\D/g, "")}`;
}

/** Rough reading-time estimate in minutes for a body of text. */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
