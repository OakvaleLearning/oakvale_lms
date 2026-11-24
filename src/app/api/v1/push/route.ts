import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireApiSession } from "@/lib/api/mobile";

/**
 * The app registers its Expo push token after sign-in (and on each launch, to
 * keep it current), and removes it on sign-out. A token belongs to one phone,
 * so registering it moves it to whoever is signed in there now.
 */
const tokenSchema = z.string().trim().min(10).max(200).regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/);

const registerSchema = z.object({
  token: tokenSchema,
  platform: z.enum(["android", "ios"]),
  appBuild: z.coerce.number().int().min(0).max(2_100_000_000).nullish(),
});

export async function POST(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid push token", 400);
  const { token, platform, appBuild } = parsed.data;
  const now = new Date();
  await prisma.pushDevice.upsert({
    where: { token },
    create: { token, platform, appBuild: appBuild ?? null, userId: session.userId },
    update: { platform, appBuild: appBuild ?? null, userId: session.userId, lastSeenAt: now },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const parsed = z.object({ token: tokenSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid push token", 400);
  await prisma.pushDevice.deleteMany({ where: { token: parsed.data.token, userId: session.userId } });
  return NextResponse.json({ ok: true });
}
