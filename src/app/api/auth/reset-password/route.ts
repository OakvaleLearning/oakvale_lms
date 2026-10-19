import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";
import {
  consumeablePasswordResetToken,
  createSession,
  hashPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);
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
        data: { passwordHash },
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
