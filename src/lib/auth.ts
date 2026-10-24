import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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
/** How long the link in the sign-up email stays valid. */
export const VERIFY_TOKEN_TTL_HOURS = 24;
/** How long the set-password link in an admin invite stays valid. */
export const ADMIN_INVITE_TTL_HOURS = 72;

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
 * The role comes from the database, not the token, so granting or removing
 * admin access applies on the next request. Cached per request.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const auth = (await headers()).get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  return user ? { ...session, role: user.role } : null;
});

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
export async function createPasswordResetToken(
  userId: string,
  ttlMinutes = RESET_TOKEN_TTL_MINUTES
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

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

/* ------------------------------------------------------------------ *
 * Email verification
 * ------------------------------------------------------------------ */

/** Issue the link token for the sign-up email; earlier unused links stop working. */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.emailVerificationToken.create({ data: { userId, tokenHash: hashResetToken(token), expiresAt } }),
  ]);
  return token;
}

/** Mark the token's user as verified. Returns the user, or null when the link is unknown/used/expired. */
export async function consumeEmailVerificationToken(token: string) {
  if (!token) return null;
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: record.user.emailVerifiedAt ?? now } }),
  ]);
  return record.user;
}

/** Whether the user has confirmed their email. Admins always count as verified. Cached per request. */
export const isEmailVerified = cache(async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, emailVerifiedAt: true } });
  return !!user && (user.role === "ADMIN" || user.emailVerifiedAt !== null);
});
