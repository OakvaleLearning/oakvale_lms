import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";

/** JSON helpers for the mobile app's `/api/v1` routes. */
export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

/** The current session, or a 401 response to return as-is. */
export async function requireApiSession(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  return session ?? jsonError("Not authenticated", 401);
}

export const publicUser = (u: { id: string; name: string; email: string; role: "LEARNER" | "ADMIN" }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
