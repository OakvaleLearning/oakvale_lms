import "server-only";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { deletePrefix, getObjectBytes, isStorageConfigured, mimeFromPath, putObject } from "@/lib/storage";
import { extractPackageText, TEXT_VERSION } from "@/lib/lms/lesson-text";

/**
 * Unpacking uploaded SCORM / HTML packages.
 *
 * The admin uploads a .zip (or a single .html) straight to R2. We then unzip it
 * here, upload each file under "content/<assetId>/", and record the entry
 * file. Learners load it through the same-origin content route
 * (/content/<assetId>/...), which SCORM needs so the package can find the
 * runtime API on the parent window.
 */

/** Unpacked packages larger than this are rejected (they are held in memory). */
export const MAX_PACKAGE_BYTES = 300 * 1024 * 1024;

export const contentPrefix = (assetId: string) => `content/${assetId}/`;

class PackageError extends Error {}

export async function ingestPackage(assetId: string): Promise<void> {
  const asset = await prisma.contentAsset.findUniqueOrThrow({
    where: { id: assetId },
    include: { lesson: { select: { type: true } } },
  });
  await prisma.contentAsset.update({ where: { id: assetId }, data: { status: "PROCESSING", error: null } });

  try {
    const prefix = contentPrefix(assetId);
    await deletePrefix(prefix); // re-processing replaces any earlier unpack
    const bytes = await getObjectBytes(asset.storageKey);

    // A single HTML file needs no unpacking.
    if (/\.html?$/i.test(asset.fileName)) {
      await putObject(prefix + "index.html", bytes, "text/html; charset=utf-8");
      const textContent = extractPackageText({ "index.html": bytes }, "index.html");
      await markReady(assetId, { launchPath: "index.html", scormVersion: null, textContent });
      return;
    }

    const files = unzip(bytes);
    if (asset.lesson.type === "SCORM") {
      const manifestPath = shallowest(Object.keys(files), (p) => /(^|\/)imsmanifest\.xml$/i.test(p));
      if (!manifestPath) throw new PackageError("No imsmanifest.xml found — is this a SCORM package?");
      const base = manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1);
      const manifest = parseManifest(new TextDecoder().decode(files[manifestPath]));
      await uploadFiles(prefix, files, base);
      await markReady(assetId, { ...manifest, textContent: extractPackageText(files, base + manifest.launchPath) });
    } else {
      const entry = shallowest(Object.keys(files), (p) => /(^|\/)index\.html?$/i.test(p))
        ?? shallowest(Object.keys(files), (p) => /\.html?$/i.test(p));
      if (!entry) throw new PackageError("No .html file found in the zip.");
      const base = entry.slice(0, entry.lastIndexOf("/") + 1);
      await uploadFiles(prefix, files, base);
      await markReady(assetId, {
        launchPath: entry.slice(base.length),
        scormVersion: null,
        textContent: extractPackageText(files, entry),
      });
    }
  } catch (err) {
    const message =
      err instanceof PackageError ? err.message : "Could not process the package. Check the file and try again.";
    if (!(err instanceof PackageError)) console.error("[packages] ingest failed:", err);
    await prisma.contentAsset.update({ where: { id: assetId }, data: { status: "FAILED", error: message } });
  }
}

function markReady(
  assetId: string,
  info: { launchPath: string; scormVersion: string | null; textContent: string }
) {
  return prisma.contentAsset.update({
    where: { id: assetId },
    data: {
      status: "READY",
      error: null,
      launchPath: info.launchPath,
      scormVersion: info.scormVersion,
      textContent: info.textContent,
      textVersion: TEXT_VERSION,
    },
  });
}

/**
 * Text of an asset processed before text extraction existed, or by an older
 * extractor (see TEXT_VERSION). Reads the
 * original upload once and stores the result ("" when there is none), so
 * later calls hit the database only.
 */
export async function backfillAssetText(asset: {
  id: string;
  storageKey: string;
  fileName: string;
  launchPath: string | null;
}): Promise<string> {
  let text = "";
  try {
    const bytes = await getObjectBytes(asset.storageKey);
    if (/\.html?$/i.test(asset.fileName)) {
      text = extractPackageText({ "index.html": bytes }, "index.html");
    } else {
      const files = unzip(bytes);
      const launch = asset.launchPath
        ? Object.keys(files).find((p) => p === asset.launchPath || p.endsWith("/" + asset.launchPath))
        : undefined;
      text = extractPackageText(files, launch);
    }
  } catch (err) {
    console.error("[packages] text backfill failed:", err);
    return "";
  }
  await prisma.contentAsset.update({ where: { id: asset.id }, data: { textContent: text, textVersion: TEXT_VERSION } });
  return text;
}

/** Whether an asset's stored text is missing or came from an older extractor. */
export function needsTextBackfill(
  lessonType: string,
  asset: { status: string; textContent: string | null; textVersion: number } | null
): boolean {
  return (
    !!asset &&
    isStorageConfigured() &&
    asset.status === "READY" &&
    (lessonType === "SCORM" || lessonType === "HTML") &&
    (asset.textContent === null || asset.textVersion < TEXT_VERSION)
  );
}

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new PackageError("The file is not a valid .zip archive.");
  }
  let total = 0;
  const out: Record<string, Uint8Array> = {};
  for (const [rawPath, data] of Object.entries(files)) {
    const path = rawPath.replace(/\\/g, "/");
    // Skip directories, macOS metadata and anything trying to escape the folder.
    if (path.endsWith("/") || path.startsWith("__MACOSX/") || path.split("/").includes("..")) continue;
    total += data.length;
    if (total > MAX_PACKAGE_BYTES) throw new PackageError("The unpacked package is larger than 300 MB.");
    out[path] = data;
  }
  return out;
}

/** The matching path with the fewest folders (packages are often zipped inside a folder). */
function shallowest(paths: string[], match: (p: string) => boolean): string | undefined {
  return paths.filter(match).sort((a, b) => a.split("/").length - b.split("/").length)[0];
}

async function uploadFiles(prefix: string, files: Record<string, Uint8Array>, base: string) {
  const entries = Object.entries(files).filter(([p]) => p.startsWith(base));
  const CONCURRENCY = 16;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(
      entries
        .slice(i, i + CONCURRENCY)
        .map(([p, data]) => putObject(prefix + p.slice(base.length), data, mimeFromPath(p)))
    );
  }
}

/* ------------------------------------------------------------------ *
 * imsmanifest.xml
 * ------------------------------------------------------------------ */

type XmlNode = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const attr = (node: XmlNode | undefined, name: string) =>
  node ? (node[`@_${name}`] as string | undefined) : undefined;

/** Find the SCORM version and the launch file of the first SCO. */
export function parseManifest(xml: string): { launchPath: string; scormVersion: string } {
  const doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml) as XmlNode;
  const manifest = doc.manifest as XmlNode | undefined;
  if (!manifest) throw new PackageError("imsmanifest.xml is missing its <manifest> element.");

  const schemaVersion = String((manifest.metadata as XmlNode | undefined)?.schemaversion ?? "");
  const scormVersion =
    schemaVersion.startsWith("1.2") || /adlcp_rootv1p2/i.test(xml) ? "1.2" : "2004";

  const resourcesNode = manifest.resources as XmlNode | undefined;
  const resourcesBase = attr(resourcesNode, "base") ?? "";
  const resources = asArray(resourcesNode?.resource as XmlNode | XmlNode[]);
  const byId = new Map(resources.map((r) => [attr(r, "identifier"), r]));

  // Follow the default organization's first item that points at a resource.
  const orgsNode = manifest.organizations as XmlNode | undefined;
  const orgs = asArray(orgsNode?.organization as XmlNode | XmlNode[]);
  const org = orgs.find((o) => attr(o, "identifier") === attr(orgsNode, "default")) ?? orgs[0];
  const firstItem = (node: XmlNode | undefined): XmlNode | undefined => {
    for (const item of asArray(node?.item as XmlNode | XmlNode[])) {
      if (attr(item, "identifierref")) return item;
      const nested = firstItem(item);
      if (nested) return nested;
    }
  };
  const item = firstItem(org);

  let resource = item ? byId.get(attr(item, "identifierref")) : undefined;
  resource ??= resources.find(
    (r) => (attr(r, "scormtype") ?? attr(r, "scormType"))?.toLowerCase() === "sco" && attr(r, "href")
  );
  resource ??= resources.find((r) => attr(r, "href"));
  const href = attr(resource, "href");
  if (!href) throw new PackageError("Could not find the launch file in imsmanifest.xml.");

  const params = item ? attr(item, "parameters") ?? "" : "";
  const launchPath = `${resourcesBase}${attr(resource, "base") ?? ""}${href}${params}`.replace(/^\/+/, "");
  return { launchPath, scormVersion };
}

/** Folder of an uploaded file, e.g. "uploads/<uuid>/" for "uploads/<uuid>/video.mp4". */
const uploadFolder = (storageKey: string) => storageKey.slice(0, storageKey.lastIndexOf("/") + 1);

/**
 * Delete the R2 files behind content assets (the upload and any unpacked
 * package). Never throws — a failed cleanup only leaves orphaned files.
 */
export async function removeAssetFiles(assets: { id: string; storageKey: string }[]): Promise<void> {
  if (!isStorageConfigured()) return;
  await Promise.all(
    assets.map(async (a) => {
      try {
        await deletePrefix(uploadFolder(a.storageKey));
        await deletePrefix(contentPrefix(a.id));
      } catch (err) {
        console.error(`[packages] could not delete files for asset ${a.id}:`, err);
      }
    })
  );
}
