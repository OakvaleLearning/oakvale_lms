import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    const invalid = NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );

    if (!user) {
      // Run a dummy compare to reduce timing signal, then fail.
      await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv");
      return invalid;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return invalid;

    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ ok: true, role: user.role });
  } catch {
    return NextResponse.json(
      { error: "Could not log you in. Please try again." },
      { status: 500 }
    );
  }
}
