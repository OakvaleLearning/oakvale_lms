import "server-only";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Push notifications to the mobile app, through Expo's push service (which
 * hands Android messages to Firebase Cloud Messaging). Phones register their
 * Expo push token at POST /api/v1/push after sign-in.
 *
 * EXPO_ACCESS_TOKEN is optional: set it only if "Enhanced push security" is
 * turned on for the Expo project.
 *
 * Pushes always go out after the response (`after`), never block the request,
 * and never throw: failures are logged.
 */

export interface PushMessage {
  title: string;
  body: string;
  /**
   * What tapping it opens: a website path (e.g. "/community/…"), opened in the
   * app's browser, or "update" to download the latest Android app.
   */
  url?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Send to every registered phone of these users (or of everyone matching `where`). */
export function queuePush(target: string[] | Prisma.PushDeviceWhereInput, message: PushMessage) {
  const where: Prisma.PushDeviceWhereInput = Array.isArray(target) ? { userId: { in: target } } : target;
  if (Array.isArray(target) && target.length === 0) return;
  after(() => sendPush(where, message).catch((err) => console.error("[push] send failed:", err)));
}

async function sendPush(where: Prisma.PushDeviceWhereInput, message: PushMessage) {
  const devices = await prisma.pushDevice.findMany({ where, select: { token: true } });
  if (devices.length === 0) return;

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const gone: string[] = [];
  for (let i = 0; i < devices.length; i += BATCH) {
    const batch = devices.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(
        batch.map((d) => ({
          to: d.token,
          title: clip(message.title, 80),
          body: clip(message.body, 180),
          data: message.url ? { url: message.url } : {},
          sound: "default",
          priority: "high",
          channelId: "default",
        }))
      ),
    });
    if (!res.ok) {
      console.error("[push] Expo returned", res.status, await res.text().catch(() => ""));
      continue;
    }
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    json?.data?.forEach((ticket, j) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") gone.push(batch[j].token);
    });
  }
  if (gone.length) await prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
}

export { clip as pushSnippet };
