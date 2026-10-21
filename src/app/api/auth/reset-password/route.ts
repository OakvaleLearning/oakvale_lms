import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";
import {
  consumeablePasswordResetToken,
  createSession,
  hashPassword,
} from "@/lib/auth";
import { HOUR, clientIp, rateLimit, tooMany } from "@/lib/rate-limit";
import { guardAuthRequest } from "@/lib/request-guard";

export async function POST(req: Request) {
  try {
    const guard = await guardAuthRequest(req);
    if (!guard.ok) return guard.response;
    const limit = await rateLimit(`reset:ip:${await clientIp()}`, 10, HOUR);
    if (!limit.ok) return tooMany(limit.retryAfterSec);
    const parsed = resetPasswordSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { token, password } = parsed.data;

    const record = await consumeablePasswordResetToken(token);
    if (!record) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        // The link arrived by email, so the address is confirmed too.
        data: { passwordHash, emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      }),
      // Burn this token and any other outstanding ones for the account.
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    const { user } = record;
    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ ok: true, role: user.role });
  } catch {
    return NextResponse.json(
      { error: "Could not reset your password. Please try again." },
      { status: 500 }
    );
  }
}
