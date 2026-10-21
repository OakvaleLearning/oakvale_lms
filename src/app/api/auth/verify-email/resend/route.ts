import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken, getSession } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/emails";
import { MINUTE, rateLimit, tooMany } from "@/lib/rate-limit";
import { guardAuthRequest } from "@/lib/request-guard";
import { safeNextPath } from "@/lib/utils";

/** Send a fresh sign-up confirmation link to the signed-in learner. */
export async function POST(req: Request) {
  try {
    const guard = await guardAuthRequest(req);
    if (!guard.ok) return guard.response;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, verified: true });

    const limit = await rateLimit(`verify-resend:${user.id}`, 3, 15 * MINUTE);
    if (!limit.ok) return tooMany(limit.retryAfterSec);

    const token = await createEmailVerificationToken(user.id);
    const sent = await sendVerificationEmail(user, token, safeNextPath(guard.body.next));
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[verify-email/resend]", err);
    return NextResponse.json({ error: "Could not send the email. Please try again." }, { status: 500 });
  }
}
