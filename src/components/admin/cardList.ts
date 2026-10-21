/**
 * Reorderable admin lists: a stack of cards on phones, divided rows from `sm` up.
 * Each row holds a controls strip (move buttons + a phone-only status) and a link.
 */
export const cardListClass =
  "space-y-2 bg-canvas/60 p-3 sm:space-y-0 sm:divide-y sm:divide-line/70 sm:bg-transparent sm:p-0";

export const cardRowClass =
  "flex flex-col rounded-xl border border-line bg-white shadow-card sm:flex-row sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:py-1 sm:pl-2 sm:pr-3 sm:shadow-none";

/** Below the link on phones, before it from `sm` up. */
export const cardControlsClass =
  "order-last flex items-center justify-between border-t border-line px-1.5 py-1 sm:order-none sm:border-0 sm:p-0";
