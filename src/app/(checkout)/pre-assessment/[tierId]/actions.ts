"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { startAttempt, submitAttempt } from "@/lib/lms/pre-assessment";

const answersSchema = z.record(z.string().max(40), z.array(z.string().max(200)).max(20));

function refresh(tierId: string) {
  revalidatePath(`/pre-assessment/${tierId}`);
  revalidatePath("/enroll");
}

/** Start (or resume) an attempt. The page re-renders with the questions, or with why it couldn't start. */
export async function startPreAssessment(tierId: string): Promise<void> {
  const session = await getSession();
  if (!session || typeof tierId !== "string") return;
  await startAttempt(session.userId, tierId);
  refresh(tierId);
}

export async function submitPreAssessment(
  tierId: string,
  attemptId: string,
  answers: unknown
): Promise<{ ok: true; passed: boolean } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please log in again." };
  const parsed = answersSchema.safeParse(answers);
  if (!parsed.success || typeof tierId !== "string" || typeof attemptId !== "string") {
    return { ok: false, error: "Invalid answers." };
  }
  const result = await submitAttempt(session.userId, tierId, attemptId, parsed.data);
  refresh(tierId);
  return result.ok ? { ok: true, passed: result.passed } : result;
}
