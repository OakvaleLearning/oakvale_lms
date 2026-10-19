"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type State = { error?: string; ok?: boolean } | undefined;

/** Give a learner a tier without payment (scholarships, corporate sponsorships, fixes). */
export async function grantEnrollment(userId: string, _prev: State, fd: FormData): Promise<State> {
  await requireAdmin();
  const tierId = String(fd.get("tierId") ?? "");
  const tier = await prisma.tier.findUnique({ where: { id: tierId } });
  if (!tier) return { error: "Choose a tier." };
  await prisma.enrollment.upsert({
    where: { userId_tierId: { userId, tierId } },
    update: { status: "ACTIVE", activatedAt: new Date() },
    create: { userId, tierId, status: "ACTIVE", source: "ADMIN", amount: 0, activatedAt: new Date() },
  });
  revalidatePath(`/admin/learners/${userId}`);
  return { ok: true };
}

export async function cancelEnrollment(enrollmentId: string): Promise<void> {
  await requireAdmin();
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "CANCELLED" } });
  revalidatePath(`/admin/learners/${e.userId}`);
}
