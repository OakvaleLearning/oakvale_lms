import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email-templates";
import { verifyUnsubscribe } from "@/lib/community/emails";

/** One-click unsubscribe from the weekly digest (signed link in the email; no login needed). */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const userId = params.get("u") ?? "";
  const signature = params.get("s") ?? "";
  if (!userId || !verifyUnsubscribe(userId, signature)) {
    return new NextResponse("This unsubscribe link isn't valid.", { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user) {
    await prisma.communityProfile.upsert({
      where: { userId },
      create: { userId, digestOptOut: true },
      update: { digestOptOut: true },
    });
  }
  return NextResponse.redirect(`${appUrl()}/community/settings?unsubscribed=1`, 303);
}
