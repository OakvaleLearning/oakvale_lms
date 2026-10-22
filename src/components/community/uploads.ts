"use client";

import { createCommunityUpload } from "@/app/community/actions";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

type Target = Parameters<typeof createCommunityUpload>[0];

function put(url: string, file: File, contentType: string, onProgress?: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

/** Upload one image straight to the bucket; resolves with its storage key. */
export async function uploadCommunityImage(target: Target, file: File, onProgress?: (percent: number) => void): Promise<string> {
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) throw new Error("Please choose a JPG, PNG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("That image is too large (max 5 MB).");
  const created = await createCommunityUpload(target, { type: file.type, size: file.size });
  if (!created.ok) throw new Error(created.error);
  await put(created.uploadUrl, file, created.contentType, onProgress);
  return created.key;
}
