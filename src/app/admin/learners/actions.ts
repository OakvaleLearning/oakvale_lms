"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

type State = { error?: string; ok?: boolean } | undefined;

/**
 * Give a learner a tier without payment (scholarships, corporate sponsorships, fixes).
 * Pre-assessments still apply unless "Skip pre-assessment" is ticked.
 */
export async function grantEnrollment(userId: string, _prev: State, fd: FormData): Promise<State> {
  const admin = await requireAdmin();
  const tierId = String(fd.get("tierId") ?? "");
  const waived = fd.get("waive") === "on";
  const tier = await prisma.tier.findUnique({ where: { id: tierId }, include: { program: { select: { title: true } } } });
  if (!tier) return { error: "Choose a tier." };
  await prisma.enrollment.upsert({
    where: { userId_tierId: { userId, tierId } },
    update: { status: "ACTIVE", activatedAt: new Date(), ...(waived ? { preAssessmentWaived: true } : {}) },
    create: { userId, tierId, status: "ACTIVE", source: "ADMIN", amount: 0, activatedAt: new Date(), preAssessmentWaived: waived },
  });
  const learner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  await audit(
    admin,
    "enrolment.grant",
    `Granted ${learner?.name} (${learner?.email}) ${tier.program.title}: ${tier.name} without payment${waived ? ", skipping the pre-assessment" : ""}`,
    { target: ["user", userId], details: { tierId, waived } }
  );
  revalidatePath(`/admin/learners/${userId}`);
  revalidatePath("/learn", "layout");
  return { ok: true };
}

/** Let an enrolment open its modules without passing a pre-assessment, or require it again. */
export async function setPreAssessmentWaiver(enrollmentId: string, waived: boolean): Promise<void> {
  const admin = await requireAdmin();
  const e = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { preAssessmentWaived: waived },
    include: { user: { select: { name: true } }, tier: { select: { name: true, program: { select: { title: true } } } } },
  });
  await audit(
    admin,
    "enrolment.waiver",
    `${waived ? "Waived" : "Required"} the pre-assessment for ${e.user.name}'s ${e.tier.program.title}: ${e.tier.name} enrolment`,
    { target: ["user", e.userId] }
  );
  revalidatePath(`/admin/learners/${e.userId}`);
  revalidatePath("/learn", "layout");
}

export async function cancelEnrollment(enrollmentId: string): Promise<void> {
  const admin = await requireAdmin();
  const e = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "CANCELLED" },
    include: { user: { select: { name: true, email: true } }, tier: { select: { name: true, program: { select: { title: true } } } } },
  });
  await audit(admin, "enrolment.cancel", `Cancelled ${e.user.name}'s (${e.user.email}) ${e.tier.program.title}: ${e.tier.name} enrolment`, {
    target: ["user", e.userId],
  });
  revalidatePath(`/admin/learners/${e.userId}`);
}
