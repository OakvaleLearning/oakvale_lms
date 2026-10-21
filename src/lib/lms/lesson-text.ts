/**
 * Plain text pulled out of a lesson's package, used to ground the AI tutor
 * and the quiz generator.
 *
 * Visible HTML comes first. Authoring tools (Articulate Rise and Storyline,
 * iSpring, Captivate…) render from JavaScript, so their text is also read
 * from the JSON they embed in .js/.json files, including base64 blobs.
 * Anything still missing is what the lesson's "Tutor notes" field is for.
 */

/** Upper bound on stored text; the tutor prompt truncates further. */
export const MAX_LESSON_TEXT = 40_000;

/** Bump when extraction improves; assets extracted by an older version are re-read. */
export const TEXT_VERSION = 2;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Visible text of an HTML document, with block elements kept on separate lines. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(
      /<\/?(br|p|div|li|ul|ol|h[1-6]|tr|table|section|article|nav|header|footer|main|aside|blockquote)\b[^>]*>/gi,
      "\n"
    )
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Text of an unpacked package: every HTML file (launch file first), then
 * content embedded in scripts. Repeated lines (navigation, footers shared
 * across pages) are kept once.
 */
export function extractPackageText(files: Record<string, Uint8Array>, launchPath?: string): string {
  const decoder = new TextDecoder();
  const byName = (a: string, b: string) => (a === launchPath ? -1 : b === launchPath ? 1 : a.localeCompare(b));
  const html = Object.keys(files).filter((p) => /\.html?$/i.test(p)).sort(byName);
  const scripts = Object.keys(files)
    .filter((p) => /\.(js|json)$/i.test(p) && !LIBRARY.test(p) && files[p].length <= MAX_SCRIPT_BYTES)
    .sort(byName);

  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;
  const add = (line: string) => {
    if (!line || seen.has(line)) return;
    seen.add(line);
    out.push(line);
    length += line.length + 1;
  };

  for (const path of html) {
    for (const line of htmlToText(decoder.decode(files[path])).split("\n")) add(line);
    if (length >= MAX_LESSON_TEXT) return out.join("\n").slice(0, MAX_LESSON_TEXT);
  }
  // Authoring-tool content: inline scripts in the HTML, then .js/.json files.
  for (const path of [...html, ...scripts]) {
    for (const line of embeddedText(decoder.decode(files[path]))) add(line);
    if (length >= MAX_LESSON_TEXT) break;
  }
  return out.join("\n").slice(0, MAX_LESSON_TEXT);
}

/** Third-party code bundled in packages; its strings are never lesson content. */
const LIBRARY = /(^|\/)(jquery|bootstrap|lodash|underscore|react|vue|angular|polyfill|vendor|modernizr|gsap|tweenmax|three|mathjax|pdf\.?js|video|howler|swiper|scormdriver|scorm_?api|pipwerks|apiwrapper)[^/]*$|\.min\.js$|(^|\/)(lib|libs|vendor|node_modules)\//i;
const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;

/** JSON keys that hold learner-facing text in authoring-tool exports. */
const TEXT_KEYS =
  "text|altText|alttext|title|heading|subheading|paragraph|caption|description|content|html|body|feedback|correctFeedback|incorrectFeedback|question|prompt|answer|label|transcript|notes|summary|instructions";
const PAIR = new RegExp(`"(?:${TEXT_KEYS})"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
const BASE64 = /["'`]([A-Za-z0-9+/]{400,}={0,2})["'`]/g;

/** Readable strings from the JSON an authoring tool embeds in a script, possibly escaped or base64-encoded. */
function embeddedText(source: string, depth = 0): string[] {
  const found: string[] = [];
  // JSON inside a JS string literal arrives escaped once (\"text\":\"…\").
  const variants = source.includes('\\"') ? [source, source.replace(/\\(["'\\/])/g, "$1")] : [source];
  for (const text of variants) {
    for (const [, raw] of text.matchAll(PAIR)) {
      let value: string;
      try {
        value = JSON.parse(`"${raw}"`);
      } catch {
        continue;
      }
      for (const line of htmlToText(value).split("\n")) if (isProse(line)) found.push(line);
    }
  }
  // Articulate Rise and others ship the whole course as base64-encoded JSON.
  if (depth === 0) {
    for (const [, blob] of source.matchAll(BASE64)) {
      const decoded = decodeBase64(blob);
      if (decoded && /^\s*[[{]/.test(decoded)) found.push(...embeddedText(decoded, 1));
    }
  }
  return found;
}

function decodeBase64(blob: string): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(blob, "base64"));
    // Some tools URI-encode the JSON before base64.
    return /^%7B|^%5B/i.test(text) ? decodeURIComponent(text) : text;
  } catch {
    return null;
  }
}

/** Keeps sentences and short phrases; drops ids, paths, colours, code and UI labels like "Next". */
function isProse(line: string): boolean {
  if (line.length < 8 || line.length > 4000) return false;
  if (!/\s/.test(line) || !/[a-z]{2}/i.test(line)) return false;
  if (/^(https?:|www\.|data:|#[0-9a-f]{3,8}\b|rgba?\()/i.test(line)) return false;
  if (/[{};]\s*$|=>|function\s*\(|\bvar\s|\.(js|css|png|jpe?g|svg|mp[34]|woff2?)\b/i.test(line)) return false;
  const letters = line.replace(/[^a-z]/gi, "").length;
  return letters / line.length > 0.55;
}
