import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const COOKIE_NAME = "oakvale_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
/** Mobile app tokens last longer; the app signs in again when one expires. */
const MOBILE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
/** WebView tickets only need to survive the redirect that turns them into a cookie. */
const TICKET_MAX_AGE = 120;
/** How long a password reset link stays valid. */
export const RESET_TOKEN_TTL_MINUTES = 60;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (min 16 chars).");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: "LEARNER" | "ADMIN";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signToken(payload, MAX_AGE);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

function signToken(payload: SessionPayload | Record<string, unknown>, maxAge: number, typ?: string) {
  return new SignJWT({ ...payload, ...(typ ? { typ } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSecret());
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    // Tickets are single-purpose and must never work as a session.
    if (payload.typ === "ticket") return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as "LEARNER" | "ADMIN",
    };
  } catch {
    return null;
  }
}

/**
 * Reads and verifies the session: an `Authorization: Bearer` token (mobile
 * app) or the session cookie (web). Returns null if absent/invalid.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) return verifySessionToken(auth.slice(7).trim());
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}

/** A bearer token for the mobile app. */
export function createMobileToken(payload: SessionPayload): Promise<string> {
  return signToken(payload, MOBILE_MAX_AGE, "mobile");
}

/**
 * A short-lived ticket that lets the app's WebView sign in for one lesson
 * (SCORM/HTML content needs a cookie session on this domain).
 */
export function createLessonTicket(userId: string, lessonId: string): Promise<string> {
  return signToken({ userId, lessonId }, TICKET_MAX_AGE, "ticket");
}

export async function verifyLessonTicket(ticket: string): Promise<{ userId: string; lessonId: string } | null> {
  try {
    const { payload } = await jwtVerify(ticket, getSecret());
    if (payload.typ !== "ticket") return null;
    return { userId: payload.userId as string, lessonId: payload.lessonId as string };
  } catch {
    return null;
  }
}

/** Full user record for the current session (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return user;
}

/** Require an authenticated session; redirect to /login otherwise. */
export async function requireSession(nextPath?: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    const suffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${suffix}`);
  }
  return session;
}

/** Require an admin session; redirect appropriately otherwise. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "ADMIN") redirect("/learn");
  return session;
}

/* ------------------------------------------------------------------ *
 * Password reset tokens
 * ------------------------------------------------------------------ */

/** Hash a raw reset token — only the hash is ever stored. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a single-use reset token for a user. Any earlier unused tokens are
 * invalidated so only the most recent emailed link works.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken(token), expiresAt },
    }),
  ]);

  return token;
}

/** Look up a reset token's user, or null when it is unknown/used/expired. */
export async function consumeablePasswordResetToken(token: string) {
  if (!token) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  return record;
}
