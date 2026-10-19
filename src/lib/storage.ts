import "server-only";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-compatible) object storage for lesson content.
 *
 * Large files never pass through our functions (Vercel caps request bodies at
 * 4.5 MB): the admin's browser PUTs straight to R2 with a presigned URL, and
 * video/audio is streamed to learners from short-lived presigned GET URLs.
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

let client: S3Client | null = null;
function r2(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error("Cloudflare R2 is not configured (R2_* env vars missing).");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      // R2_ENDPOINT lets local development point at an S3-compatible server
      // (e.g. MinIO); production uses the account's R2 endpoint.
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: Boolean(process.env.R2_ENDPOINT),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      // R2 rejects the CRC32 checksum params newer SDKs add to presigned URLs
      // by default, which would break browser uploads.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const bucket = () => process.env.R2_BUCKET!;

/** Presigned URL the browser PUTs a file to. Must send the same Content-Type. */
export function presignUpload(key: string, contentType: string, ttlSec = 60 * 60) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: ttlSec }
  );
}

/** Short-lived presigned GET URL (supports range requests, so media can seek). */
export function presignDownload(key: string, ttlSec = 2 * 60 * 60) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: ttlSec,
  });
}

/** Fetch an object, or null when it doesn't exist. */
export async function getObject(key: string) {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      etag: res.ETag,
    };
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

/** Fetch a whole object into memory (used to unpack uploaded zips). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Object ${key} is empty`);
  return res.Body.transformToByteArray();
}

export async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  await r2().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  );
}

/** Delete every object under a prefix (e.g. a whole unpacked SCORM package). */
export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const list = await r2().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token })
    );
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

/** Content-Type for a file inside an unpacked SCORM/HTML package. */
export function mimeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  xml: "application/xml",
  xsd: "application/xml",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  pdf: "application/pdf",
  swf: "application/x-shockwave-flash",
  vtt: "text/vtt",
};
