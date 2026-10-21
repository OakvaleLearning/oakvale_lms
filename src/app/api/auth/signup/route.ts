import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validation";
import { hashPassword, createSession, createEmailVerificationToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/emails";
import { HOUR, clientIp, rateLimit, tooMany } from "@/lib/rate-limit";
import { guardAuthRequest } from "@/lib/request-guard";
import { normalizePhone, safeNextPath } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const guard = await guardAuthRequest(req);
    if (!guard.ok) return guard.response;

    const parsed = signupSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const limit = await rateLimit(`signup:ip:${await clientIp()}`, 5, HOUR);
    if (!limit.ok) return tooMany(limit.retryAfterSec);

    const { name, email, phone, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        phone: normalizePhone(phone),
        passwordHash,
      },
    });

    // The account works without it; the learner can resend from /verify-email.
    const token = await createEmailVerificationToken(user.id);
    await sendVerificationEmail(user, token, safeNextPath(guard.body.next));

    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ ok: true, role: user.role, verify: true });
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 }
    );
  }
}
