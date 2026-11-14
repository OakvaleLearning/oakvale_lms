import type { ElementType } from "react";

/** A page in the app that the search can return. `href` is always a relative link. */
export interface SearchEntry {
  label: string;
  href: string;
  /** Group heading on the results page, e.g. "Learning" or a programme's title. */
  section: string;
  icon: ElementType;
  /** Extra words to match on, beyond the label and section. */
  keywords?: string;
}

/**
 * Entries whose text contains every word of `query` (case-insensitive). Label matches rank first:
 * an exact label, then a label starting with the first word, then any label containing it.
 */
export function matchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const phrase = words.join(" ");

  const ranked: { entry: SearchEntry; rank: number }[] = [];
  for (const entry of entries) {
    const haystack = `${entry.label} ${entry.section} ${entry.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    const label = entry.label.toLowerCase();
    const rank = label === phrase ? 0 : label.startsWith(words[0]) ? 1 : label.includes(words[0]) ? 2 : 3;
    ranked.push({ entry, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.entry);
}
