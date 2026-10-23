import "server-only";
import { backfillAssetText, needsTextBackfill } from "./packages";

/** The bits of a lesson part that carry written material. */
export interface MaterialPart {
  type: string;
  title: string;
  body: string;
  asset: {
    id: string;
    storageKey: string;
    fileName: string;
    launchPath: string | null;
    status: string;
    textContent: string | null;
    textVersion: number;
  } | null;
}

/**
 * Plain text of a lesson's parts, in order: written (TEXT) parts as typed, and
 * the text pulled out of SCORM / web page packages. Videos, audio and documents
 * have none of their own — instructors add a transcript or key points to the
 * lesson's "Tutor notes" for those.
 */
export async function partsText(parts: MaterialPart[]): Promise<string> {
  const chunks = await Promise.all(
    parts.map(async (p) => {
      if (p.type === "TEXT") return [p.title, p.body].filter(Boolean).join("\n");
      if (!p.asset) return "";
      // Packages extracted before (or by an older extractor) are read again.
      return needsTextBackfill(p.type, p.asset) ? backfillAssetText(p.asset) : (p.asset.textContent ?? "");
    })
  );
  return chunks.filter(Boolean).join("\n\n");
}
