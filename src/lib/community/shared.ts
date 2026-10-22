/**
 * Community types and helpers shared by server code and client components.
 * Nothing here may import server-only modules.
 */

export type ReactionKind = "LIKE" | "LOVE" | "CELEBRATE" | "INSIGHTFUL";

export const REACTIONS: Record<ReactionKind, { emoji: string; label: string }> = {
  LIKE: { emoji: "👍", label: "Like" },
  LOVE: { emoji: "❤️", label: "Love" },
  CELEBRATE: { emoji: "🎉", label: "Celebrate" },
  INSIGHTFUL: { emoji: "💡", label: "Insightful" },
};

export interface AuthorView {
  id: string;
  name: string;
  avatar: string | null;
  headline: string;
  /** Admins post as the Oakvale Team. */
  team: boolean;
}

export interface PostView {
  id: string;
  group: { id: string; slug: string; name: string };
  author: AuthorView;
  body: string;
  images: string[];
  announcement: boolean;
  pinned: boolean;
  locked: boolean;
  commentCount: number;
  reactionCount: number;
  /** The most-used reaction kinds, for the summary under the post. */
  topReactions: ReactionKind[];
  myReaction: ReactionKind | null;
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  canModerate: boolean;
}

export interface CommentView {
  id: string;
  parentId: string | null;
  author: AuthorView;
  body: string;
  createdAt: string;
  reactionCount: number;
  myReaction: ReactionKind | null;
  deleted: boolean;
  canDelete: boolean;
  replies: CommentView[];
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Storage key prefixes: post and event images per group, avatars per person. */
export const postImagePrefix = (groupId: string) => `community/${groupId}/`;
export const avatarPrefix = (userId: string) => `community/avatars/${userId}/`;

/** Uploaded community images are served through an access-checked route. */
export const mediaUrl = (key: string) => `/api/community/media/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Events are entered and shown in Nigerian time (WAT, UTC+1, no daylight
 * saving), so times look the same on the server and in every browser.
 * Calendar files carry the absolute time for learners elsewhere.
 */
export const EVENT_TIMEZONE = "Africa/Lagos";
export const EVENT_TZ_LABEL = "WAT";
const WAT_OFFSET = "+01:00";

/** "2026-11-03T18:30" (as typed in a datetime-local input, in WAT) → Date. */
export function parseEventTime(local: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return undefined;
  const d = new Date(`${local}:00${WAT_OFFSET}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Date → the datetime-local value for that moment in WAT. */
export function toEventInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const wat = new Date(new Date(date).getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 16);
}

export function formatEventTime(date: Date | string, opts: { withDay?: boolean } = {}): string {
  const d = new Date(date);
  const time = d.toLocaleTimeString("en-GB", { timeZone: EVENT_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true });
  if (opts.withDay === false) return `${time} ${EVENT_TZ_LABEL}`;
  const day = d.toLocaleDateString("en-GB", { timeZone: EVENT_TIMEZONE, weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${time} ${EVENT_TZ_LABEL}`;
}

/** Month and day for the date tile on event cards. */
export function eventDateParts(date: Date | string) {
  const d = new Date(date);
  return {
    month: d.toLocaleDateString("en-GB", { timeZone: EVENT_TIMEZONE, month: "short" }).toUpperCase(),
    day: d.toLocaleDateString("en-GB", { timeZone: EVENT_TIMEZONE, day: "numeric" }),
  };
}

/** "just now", "5m", "3h", "2d", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
