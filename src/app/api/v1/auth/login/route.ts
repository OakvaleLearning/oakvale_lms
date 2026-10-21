import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { createMobileToken, verifyPassword } from "@/lib/auth";
import { jsonError, publicUser } from "@/lib/api/mobile";
import { MINUTE, clientIp, rateLimitAll, tooMany } from "@/lib/rate-limit";

/** Mobile sign-in: returns a bearer token instead of setting a cookie. */
export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const { email, password } = parsed.data;
  // No BotID here: the app has no browser to run its check, so rate limits only.
  const ip = await clientIp();
  const limit = await rateLimitAll([
    [`login:${ip}:${email.toLowerCase()}`, 10, 15 * MINUTE],
    [`login:ip:${ip}`, 30, 15 * MINUTE],
  ]);
  if (!limit.ok) return tooMany(limit.retryAfterSec);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    // Run a dummy compare to reduce timing signal, then fail.
    await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv");
    return jsonError("Invalid email or password.", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) return jsonError("Invalid email or password.", 401);

  const token = await createMobileToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
  return NextResponse.json({ token, user: publicUser(user) });
}
