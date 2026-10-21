import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { createPasswordResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/emails";
import { HOUR, clientIp, rateLimitAll, tooMany } from "@/lib/rate-limit";
import { guardAuthRequest } from "@/lib/request-guard";

export async function POST(req: Request) {
  // Always answers the same way so the endpoint can't be used to discover
  // which email addresses have accounts.
  const ok = NextResponse.json({ ok: true });

  try {
    const guard = await guardAuthRequest(req);
    if (!guard.ok) return guard.response;
    const parsed = forgotPasswordSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const limit = await rateLimitAll([
      [`forgot:email:${email}`, 3, HOUR],
      [`forgot:ip:${await clientIp()}`, 10, HOUR],
    ]);
    if (!limit.ok) return tooMany(limit.retryAfterSec);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (!user) return ok;

    const token = await createPasswordResetToken(user.id);
    await sendPasswordResetEmail(user, token);

    return ok;
  } catch {
    return NextResponse.json(
      { error: "Could not send the reset link. Please try again." },
      { status: 500 }
    );
  }
}
