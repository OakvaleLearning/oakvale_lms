import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { createPasswordResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/emails";

export async function POST(req: Request) {
  // Always answers the same way so the endpoint can't be used to discover
  // which email addresses have accounts.
  const ok = NextResponse.json({ ok: true });

  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
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
