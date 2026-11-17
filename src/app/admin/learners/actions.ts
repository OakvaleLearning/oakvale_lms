"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type State = { error?: string; ok?: boolean } | undefined;

/**
 * Give a learner a tier without payment (scholarships, corporate sponsorships, fixes).
 * Pre-assessments still apply unless "Skip pre-assessment" is ticked.
 */
export async function grantEnrollment(userId: string, _prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const tierId = String(fd.get("tierId") ?? "");
  const waived = fd.get("waive") === "on";
  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) return { error: "Choose a tier." };
  await prisma.enrollment.upsert({
    where: { userId_tierId: { userId, tierId } },
    update: { status: "ACTIVE", activatedAt: new Date(), ...(waived ? { preAssessmentWaived: true } : {}) },
    create: { userId, tierId, status: "ACTIVE", source: "ADMIN", amount: 0, activatedAt: new Date(), preAssessmentWaived: waived },
  });
  revalidatePath(`/admin/learners/${userId}`);
  revalidatePath("/learn", "layout");
  return { ok: true };
}

/** Let an enrolment open its modules without passing a pre-assessment, or require it again. */
export async function setPreAssessmentWaiver(enrollmentId: string, waived: boolean): Promise<void> {
  await requireAdmin();
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { preAssessmentWaived: waived } });
  revalidatePath(`/admin/learners/${e.userId}`);
  revalidatePath("/learn", "layout");
}

export async function cancelEnrollment(enrollmentId: string): Promise<void> {
  await requireAdmin();
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "CANCELLED" } });
  revalidatePath(`/admin/learners/${e.userId}`);
}
