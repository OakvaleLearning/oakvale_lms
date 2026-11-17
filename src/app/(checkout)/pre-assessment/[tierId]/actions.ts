"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { startAttempt, submitAttempt } from "@/lib/lms/pre-assessment";

const answersSchema = z.record(z.string().max(40), z.array(z.string().max(200)).max(20));
const submitSchema = z.object({ clientId: z.string().min(8).max(64), answers: answersSchema });

function refresh(tierId: string) {
  revalidatePath(`/pre-assessment/${tierId}`);
  revalidatePath("/enroll");
  revalidatePath("/learn");
}

/** Start (or resume) an attempt. The page re-renders with the questions. */
export async function startPreAssessment(tierId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please log in again." };
  if (typeof tierId !== "string") return { ok: false, error: "Invalid request." };
  const h = await headers();
  const result = await startAttempt(session.userId, tierId, { ip: await clientIp(), userAgent: h.get("user-agent") });
  refresh(tierId);
  return result;
}

export async function submitPreAssessment(
  tierId: string,
  attemptId: string,
  input: unknown
): Promise<{ ok: true; passed: boolean } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please log in again." };
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success || typeof tierId !== "string" || typeof attemptId !== "string") {
    return { ok: false, error: "Invalid answers." };
  }
  const result = await submitAttempt(session.userId, tierId, attemptId, parsed.data, await clientIp());
  refresh(tierId);
  return result.ok ? { ok: true, passed: result.passed } : result;
}
