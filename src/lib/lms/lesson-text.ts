/**
 * Plain text pulled out of a lesson's HTML, used to ground the AI tutor.
 *
 * This is deliberately simple: authoring tools that render everything from
 * JavaScript (e.g. some Storyline exports) yield little text, which is what
 * the lesson's "Tutor notes" field is for.
 */

/** Upper bound on stored text; the tutor prompt truncates further. */
export const MAX_LESSON_TEXT = 40_000;

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
 * Text of every HTML file in an unpacked package, launch file first.
 * Repeated lines (navigation, footers shared across pages) are kept once.
 */
export function extractPackageText(files: Record<string, Uint8Array>, launchPath?: string): string {
  const decoder = new TextDecoder();
  const paths = Object.keys(files)
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => (a === launchPath ? -1 : b === launchPath ? 1 : a.localeCompare(b)));

  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;
  for (const path of paths) {
    for (const line of htmlToText(decoder.decode(files[path])).split("\n")) {
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
      length += line.length + 1;
      if (length >= MAX_LESSON_TEXT) return out.join("\n").slice(0, MAX_LESSON_TEXT);
    }
  }
  return out.join("\n");
}
