"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ADMIN_INVITE_TTL_HOURS, createPasswordResetToken, hashPassword, requireAdmin } from "@/lib/auth";
import { sendAdminInviteEmail } from "@/lib/emails";
import { adminInviteSchema } from "@/lib/validation";

type State = { error?: string; ok?: boolean } | undefined;

/**
 * Give someone admin access. An existing learner account is promoted and keeps
 * its password; a new address gets an account and an email to set a password.
 */
export async function addAdmin(_prev: State, fd: FormData): Promise<State> {
  const session = await requireAdmin();
  const parsed = adminInviteSchema.safeParse({ name: fd.get("name"), email: fd.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { name, email } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existing?.role === "ADMIN") return { error: "That person is already an admin." };
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
    revalidatePath("/admin/team");
    return { ok: true };
  }

  // Unusable password until they follow the invite link.
  const user = await prisma.user.create({
    data: { name, email, role: "ADMIN", passwordHash: await hashPassword(randomBytes(32).toString("hex")) },
  });
  revalidatePath("/admin/team");
  const token = await createPasswordResetToken(user.id, ADMIN_INVITE_TTL_HOURS * 60);
  const sent = await sendAdminInviteEmail(user, session.name, token);
  if (!sent) {
    return { error: `${name} was added, but the invite email didn't send. Ask them to use “Forgot password” on the login page.` };
  }
  return { ok: true };
}

/** Take away admin access (the account stays, as a learner). */
export async function removeAdmin(userId: string): Promise<State> {
  const session = await requireAdmin();
  if (userId === session.userId) return { error: "You can't remove yourself." };
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins <= 1) return { error: "There must be at least one admin." };
  await prisma.user.updateMany({ where: { id: userId, role: "ADMIN" }, data: { role: "LEARNER" } });
  revalidatePath("/admin/team");
  return { ok: true };
}

/**
 * Send a fresh set-password link to an admin who hasn't used their invite yet.
 * Any earlier link stops working.
 */
export async function resendAdminInvite(_prev: State, fd: FormData): Promise<State> {
  const session = await requireAdmin();
  const userId = String(fd.get("userId") ?? "");
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "ADMIN" },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return { error: "That admin no longer exists." };
  if (user.emailVerifiedAt) return { error: "They've already set their password." };

  const token = await createPasswordResetToken(user.id, ADMIN_INVITE_TTL_HOURS * 60);
  const sent = await sendAdminInviteEmail(user, session.name, token);
  if (!sent) return { error: "The email didn't send. Try again in a moment." };
  return { ok: true };
}
