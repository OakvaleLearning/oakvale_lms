"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  COVER_PREFIX,
  coverKey,
  coverPath,
  deletePrefix,
  ensureUploadCors,
  isStorageConfigured,
  presignUpload,
} from "@/lib/storage";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type CoverTarget = { kind: "program" | "course" | "group"; id: string };

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_COVER_BYTES = 5 * 1024 * 1024;

const prefixFor = (t: CoverTarget) => `${COVER_PREFIX}${t.kind}s/${t.id}/`;

async function exists(t: CoverTarget) {
  const select = { coverImage: true } as const;
  if (t.kind === "program") return prisma.program.findUnique({ where: { id: t.id }, select });
  if (t.kind === "group") return prisma.communityGroup.findUnique({ where: { id: t.id }, select });
  return prisma.course.findUnique({ where: { id: t.id }, select });
}

function refresh(t: CoverTarget) {
  if (t.kind === "group") {
    revalidatePath(`/admin/community/groups/${t.id}`);
    revalidatePath("/community", "layout");
    return;
  }
  revalidatePath(t.kind === "program" ? `/admin/programs/${t.id}` : `/admin/courses/${t.id}`);
  revalidatePath("/learn", "layout");
  revalidatePath("/enroll");
}

/** Step 1: a presigned PUT URL for the browser to upload the image to. */
export async function createCoverUpload(
  target: CoverTarget,
  file: { type: string; size: number }
): Promise<Result<{ uploadUrl: string; key: string; contentType: string }>> {
  await requireAdmin();
  if (!isStorageConfigured()) return { ok: false, error: "File storage (AWS S3) is not configured yet." };
  if (!(await exists(target))) return { ok: false, error: "Not found." };

  const ext = IMAGE_TYPES[String(file.type)];
  if (!ext) return { ok: false, error: "Please choose a JPG, PNG or WebP image." };
  if (!(file.size > 0) || file.size > MAX_COVER_BYTES) return { ok: false, error: "That image is too large (max 5 MB)." };

  const corsError = await ensureUploadCors(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").origin);
  if (corsError) return { ok: false, error: corsError };

  const key = `${prefixFor(target)}${randomUUID()}.${ext}`;
  return { ok: true, key, contentType: file.type, uploadUrl: await presignUpload(key, file.type) };
}

/** Step 2 (or removal with key = null): save the cover and delete the previous upload. */
export async function saveCover(target: CoverTarget, key: string | null): Promise<Result> {
  await requireAdmin();
  const current = await exists(target);
  if (!current) return { ok: false, error: "Not found." };
  if (key !== null && !key.startsWith(prefixFor(target))) return { ok: false, error: "Invalid upload." };

  const coverImage = key ? coverPath(key) : null;
  if (target.kind === "program") {
    await prisma.program.update({ where: { id: target.id }, data: { coverImage } });
  } else if (target.kind === "group") {
    await prisma.communityGroup.update({ where: { id: target.id }, data: { coverImage } });
  } else {
    await prisma.course.update({ where: { id: target.id }, data: { coverImage } });
  }

  const old = coverKey(current.coverImage);
  if (old && old !== key) await deletePrefix(old).catch((err) => console.error("[covers] cleanup failed:", err));
  refresh(target);
  return { ok: true };
}
