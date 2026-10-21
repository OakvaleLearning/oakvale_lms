import "server-only";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/**
 * Object storage for lesson content.
 *
 * Production: the AWS S3 bucket connected to the Vercel project
 * (S3_BUCKET_NAME, AWS_REGION, AWS_ROLE_ARN). There are no access keys: the
 * function's Vercel OIDC token is exchanged for short-lived AWS credentials.
 *
 * Local development: any S3-compatible server with keys (R2_ENDPOINT,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET), e.g. MinIO.
 *
 * Large files never pass through our functions (Vercel caps request bodies at
 * 4.5 MB): the admin's browser PUTs straight to the bucket with a presigned
 * URL, and video/audio is streamed to learners from presigned GET URLs.
 */
type Backend = { bucket: string; config: () => S3ClientConfig };

function backend(): Backend | null {
  const { S3_BUCKET_NAME, AWS_REGION, AWS_ROLE_ARN } = process.env;
  if (S3_BUCKET_NAME && AWS_REGION && AWS_ROLE_ARN) {
    return {
      bucket: S3_BUCKET_NAME,
      config: () => ({
        region: AWS_REGION,
        credentials: awsCredentialsProvider({ roleArn: AWS_ROLE_ARN, clientConfig: { region: AWS_REGION } }),
      }),
    };
  }
  const { R2_ENDPOINT, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if ((R2_ENDPOINT || R2_ACCOUNT_ID) && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return {
      bucket: R2_BUCKET,
      config: () => ({
        region: "auto",
        endpoint: R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        forcePathStyle: Boolean(R2_ENDPOINT),
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      }),
    };
  }
  return null;
}

export function isStorageConfigured(): boolean {
  return backend() !== null;
}

function newClient(): S3Client {
  const b = backend();
  if (!b) throw new Error("File storage is not configured (S3_BUCKET_NAME / AWS_ROLE_ARN missing).");
  return new S3Client({
    ...b.config(),
    // Browsers can't compute the CRC32 checksums newer SDKs add to presigned
    // PUT URLs by default, which would break direct uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

let client: S3Client | null = null;
function s3(): S3Client {
  client ??= newClient();
  return client;
}

const bucket = () => backend()!.bucket;

/**
 * A presigned URL stops working when the credentials that signed it expire.
 * OIDC credentials last an hour and are cached, so a URL signed with a cached
 * set could die within minutes; sign with a fresh client (fresh credentials)
 * so every URL gets its full lifetime.
 */
const SIGNED_URL_TTL = 55 * 60;

/** Presigned URL the browser PUTs a file to. Must send the same Content-Type. */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    newClient(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: SIGNED_URL_TTL }
  );
}

/** Presigned GET URL (supports range requests, so media can seek). Valid ~1 hour. */
export function presignDownload(key: string) {
  return getSignedUrl(newClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: SIGNED_URL_TTL,
  });
}

/**
 * Browser uploads need a CORS rule on the bucket allowing PUT from this app.
 * Adds it if missing (once per server instance). Returns an error message if
 * the bucket's permissions don't allow us to check or set it.
 */
let corsChecked = false;
export async function ensureUploadCors(origin: string): Promise<string | null> {
  // Only the AWS bucket; local S3-compatible servers are configured by hand.
  if (corsChecked || !process.env.AWS_ROLE_ARN) return null;
  const rule = {
    AllowedOrigins: [origin],
    AllowedMethods: ["PUT", "GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  };
  try {
    let rules: (typeof rule)[] = [];
    try {
      const current = await s3().send(new GetBucketCorsCommand({ Bucket: bucket() }));
      rules = (current.CORSRules ?? []) as (typeof rule)[];
    } catch (err) {
      if ((err as { name?: string }).name !== "NoSuchCORSConfiguration") throw err;
    }
    const covered = rules.some(
      (r) => r.AllowedOrigins?.some((o) => o === origin || o === "*") && r.AllowedMethods?.includes("PUT")
    );
    if (!covered) {
      await s3().send(new PutBucketCorsCommand({ Bucket: bucket(), CORSConfiguration: { CORSRules: [...rules, rule] } }));
    }
    corsChecked = true;
    return null;
  } catch (err) {
    console.error("[storage] CORS check failed:", err);
    return `The storage bucket needs a CORS rule allowing PUT from ${origin}, and the app isn't allowed to add it. Add it in the AWS console (see README).`;
  }
}

/** Fetch an object, or null when it doesn't exist. */
export async function getObject(key: string) {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
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
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Object ${key} is empty`);
  return res.Body.transformToByteArray();
}

export async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  );
}

/** Delete every object under a prefix (e.g. a whole unpacked SCORM package). */
export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const list = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token })
    );
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
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

/* ------------------------------------------------------------------ *
 * Cover images (programmes and courses)
 * ------------------------------------------------------------------ */

/** Bucket prefix for cover images; these are served publicly via /media/. */
export const COVER_PREFIX = "covers/";

/** What we store in coverImage for an uploaded file: a path served by /media/[...key]. */
export const coverPath = (key: string) => `/media/${key}`;

/** The bucket key behind a stored coverImage, or null for external URLs / none. */
export function coverKey(coverImage: string | null | undefined): string | null {
  const key = coverImage?.startsWith("/media/") ? coverImage.slice("/media/".length) : null;
  return key?.startsWith(COVER_PREFIX) ? key : null;
}

/** Absolute URL for a stored coverImage, e.g. for the mobile app. */
export function absoluteCoverUrl(coverImage: string | null): string | null {
  if (!coverImage || !coverImage.startsWith("/")) return coverImage;
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "")}${coverImage}`;
}
