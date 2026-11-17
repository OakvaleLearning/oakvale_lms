"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { advanceAttempt, getOpenAttempt, startAttempt, type AdvanceResult, type AttemptView } from "@/lib/lms/pre-assessment";

const advanceSchema = z.object({
  clientId: z.string().min(8).max(64),
  questionId: z.string().min(1).max(40),
  answer: z.array(z.string().max(200)).max(20),
});

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

/**
 * Answer the current question and move on (no way back). Returns the next
 * question, or that the attempt has ended (the page then shows the result).
 */
export async function advancePreAssessment(tierId: string, attemptId: string, input: unknown): Promise<AdvanceResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please log in again." };
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success || typeof tierId !== "string" || typeof attemptId !== "string") {
    return { ok: false, error: "Invalid answer." };
  }
  const result = await advanceAttempt(session.userId, tierId, attemptId, parsed.data, await clientIp());
  if (result.ok && result.ended) refresh(tierId);
  return result;
}

/** The question the attempt is really on, after the server moved on (a question's time ran out). Null once it has ended. */
export async function currentPreAssessmentQuestion(attemptId: string): Promise<AttemptView | null> {
  const session = await getSession();
  if (!session || typeof attemptId !== "string") return null;
  return getOpenAttempt(session.userId, attemptId);
}
