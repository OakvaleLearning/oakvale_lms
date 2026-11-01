/**
 * Lesson parts ("blocks"). A lesson is an ordered list of parts — video, audio,
 * SCORM, web page, document, text, embed, quiz — that learners work through in turn.
 *
 * Shared by server and client code: no database access here.
 */

export const BLOCK_TYPES = ["VIDEO", "AUDIO", "SCORM", "HTML", "DOCUMENT", "TEXT", "EMBED", "QUIZ"] as const;
export type BlockKind = (typeof BLOCK_TYPES)[number];

/** Parts backed by an uploaded file. */
export const FILE_BLOCKS = ["VIDEO", "AUDIO", "SCORM", "HTML", "DOCUMENT"] as const;
export type FileBlockKind = (typeof FILE_BLOCKS)[number];

export const isFileBlock = (type: string): type is FileBlockKind => (FILE_BLOCKS as readonly string[]).includes(type);

/** SCORM state and quiz attempts are kept per lesson, so each can appear once. */
export const ONE_PER_LESSON: readonly BlockKind[] = ["SCORM", "QUIZ"];

/** Parts that report their own completion; learners can't tick them off by hand. */
export const SELF_REPORTING: readonly BlockKind[] = ["VIDEO", "AUDIO", "SCORM", "QUIZ"];

export const BLOCK_LABEL: Record<BlockKind, string> = {
  VIDEO: "Video",
  AUDIO: "Audio",
  SCORM: "Interactive (SCORM)",
  HTML: "Web page",
  DOCUMENT: "Document",
  TEXT: "Text",
  EMBED: "Embed",
  QUIZ: "Quiz",
};

/** One line shown in the "Add a part" palette. */
export const BLOCK_HINT: Record<BlockKind, string> = {
  VIDEO: "MP4, WebM or MOV. Resumes where learners stopped.",
  AUDIO: "A recording or podcast-style talk.",
  SCORM: "A package from an authoring tool. Tracks its own score.",
  HTML: "A web page or interactive .zip of one.",
  DOCUMENT: "PDF, Word, PowerPoint, Excel or an image.",
  TEXT: "Write notes, steps or key points right here.",
  EMBED: "A Genially or other online module, by its link.",
  QUIZ: "Check understanding. One per lesson.",
};

/** What a lesson is called overall, from the kinds of part it holds. */
export type LessonKind = BlockKind | "MIXED";

export function lessonTypeFor(types: readonly BlockKind[]): LessonKind {
  return types.length === 1 ? types[0] : "MIXED";
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const OFFICE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** What each file part accepts. R2 single PUTs top out just under 5 GB. */
export const UPLOAD_RULES: Record<
  FileBlockKind,
  { types: readonly string[]; ext: RegExp; max: number; label: string; accept: string; hint: string }
> = {
  VIDEO: {
    types: ["video/mp4", "video/webm", "video/quicktime"],
    ext: /\.(mp4|webm|mov)$/i,
    max: 4.9 * GB,
    label: "an MP4, WebM or MOV video",
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
    hint: "MP4 (H.264) plays everywhere. Up to 4.9 GB.",
  },
  AUDIO: {
    types: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac"],
    ext: /\.(mp3|m4a|wav|ogg|aac|webm)$/i,
    max: 1 * GB,
    label: "an MP3, M4A, WAV, AAC or OGG file",
    accept: "audio/*,.mp3,.m4a,.wav,.ogg,.aac",
    hint: "MP3 or M4A recommended. Up to 1 GB.",
  },
  SCORM: {
    types: ["application/zip", "application/x-zip-compressed", "application/octet-stream", ""],
    ext: /\.zip$/i,
    max: 300 * MB,
    label: "a SCORM .zip package",
    accept: ".zip,application/zip",
    hint: "The .zip exported from your authoring tool (SCORM 1.2 or 2004), with imsmanifest.xml. Up to 300 MB.",
  },
  HTML: {
    types: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "text/html", ""],
    ext: /\.(zip|html?)$/i,
    max: 300 * MB,
    label: "a .zip or .html file",
    accept: ".zip,.html,.htm,application/zip,text/html",
    hint: "A single .html file, or a .zip of a web page with index.html. Up to 300 MB.",
  },
  DOCUMENT: {
    types: [...OFFICE, "image/png", "image/jpeg", "image/webp", "image/gif", "application/octet-stream", ""],
    ext: /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|webp|gif)$/i,
    max: 200 * MB,
    label: "a PDF, Word, PowerPoint or Excel file, or an image",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif",
    hint: "PDFs and images show right in the lesson; Office files are offered as a download. Up to 200 MB.",
  },
};

/** How a dropped file will be shown, from its name. */
export function documentKind(fileName: string): "pdf" | "image" | "download" {
  if (/\.pdf$/i.test(fileName)) return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(fileName)) return "image";
  return "download";
}

/** Word, PowerPoint and Excel files, which browsers can't show but Microsoft's web viewer can. */
export function isOfficeFile(fileName: string): boolean {
  return /\.(docx?|pptx?|xlsx?)$/i.test(fileName);
}

/** Microsoft's embeddable viewer for a publicly fetchable (here: short-lived signed) file URL. */
export function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

/**
 * The part type a file most likely belongs in, from its name. A .zip could be
 * a SCORM package or a web page: "ZIP" is resolved on the server by looking for
 * imsmanifest.xml.
 */
export function blockTypeForFile(fileName: string): FileBlockKind | "ZIP" | null {
  if (/\.(mp4|webm|mov)$/i.test(fileName)) return "VIDEO";
  if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(fileName)) return "AUDIO";
  if (/\.html?$/i.test(fileName)) return "HTML";
  if (/\.zip$/i.test(fileName)) return "ZIP";
  if (UPLOAD_RULES.DOCUMENT.ext.test(fileName)) return "DOCUMENT";
  return null;
}

/** Parts the mobile app opens in a WebView (POST /api/v1/lessons/<id>/launch). */
export const isWebPart = (part: { type: string }) => part.type === "SCORM" || part.type === "HTML" || part.type === "EMBED";

/** Whole minutes → seconds, for the per-part "estimated time" box. */
export const minutesToSeconds = (min: number) => Math.round(min * 60);

/** Longest written content a TEXT part may hold. */
export const MAX_TEXT_CHARS = 60_000;

/**
 * The iframe URL for an EMBED part, from what an admin pasted: a share link
 * (https://view.genially.com/…) or a whole embed code: an <iframe src="…">, or
 * Genially's <div class="genially-embed"> + script. Only https pages can be embedded.
 * Returns "" for an empty input.
 */
export function normalizeEmbedUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: true, url: "" };
  // Genially's default embed code is a <div id="<creation id>" class="genially-embed"> plus a script.
  const geniallyId =
    /<div\b[^>]*\bid\s*=\s*["']([a-f0-9]{16,40})["'][^>]*genially-embed/i.exec(raw)?.[1] ??
    /<div\b[^>]*genially-embed[^>]*\bid\s*=\s*["']([a-f0-9]{16,40})["']/i.exec(raw)?.[1];
  const fromCode =
    /<iframe\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i.exec(raw)?.[1] ??
    (geniallyId ? `https://view.genially.com/${geniallyId}` : undefined);
  if (!fromCode && raw.startsWith("<")) return { ok: false, error: "That embed code has no iframe link in it. Paste the share link instead." };
  const candidate = (fromCode ?? raw).replace(/&amp;/g, "&").trim();

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return { ok: false, error: "That doesn't look like a link. Paste the share link or embed code." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Only https:// links can be embedded." };
  if (url.username || url.password) return { ok: false, error: "That link can't be embedded." };
  // Genially's editor needs a login; the public view link is what learners can see.
  if (/(^|\.)genial(\.ly|ly\.com)$/i.test(url.hostname) && url.hostname.startsWith("app.")) {
    return { ok: false, error: "That's the Genially editor link. In Genially, use Share → Link (view.genially.com/…) instead." };
  }
  if (url.href.length > 2000) return { ok: false, error: "That link is too long." };
  return { ok: true, url: url.href };
}

/** "view.genially.com" from an embed URL, for summaries. */
export function embedHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
