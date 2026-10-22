"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { sendCoursesOpenEmail } from "@/lib/emails";
import { isPrelaunch } from "@/lib/launch";

export type LaunchEmailState = { error?: string; message?: string } | undefined;

const BATCH = 100;
// Resend's default limit is 2 requests/second.
const pause = () => new Promise((r) => setTimeout(r, 600));

/** Learners with an active enrolment who haven't had the "courses are open" email. */
export async function countLaunchEmailsPending() {
  return prisma.user.count({
    where: { role: "LEARNER", launchEmailSentAt: null, enrollments: { some: { status: "ACTIVE" } } },
  });
}

/**
 * Launch day: emails early enrolees that courses are open, up to 100 per
 * click. Each learner is claimed before sending, so a double click or a
 * second admin never emails anyone twice; a failed send is released to retry.
 */
export async function sendLaunchEmails(): Promise<LaunchEmailState> {
  await requireAdmin();
  if (isPrelaunch()) return { error: "Turn off pre-launch mode (remove PRELAUNCH and redeploy) first." };
  if (!isEmailConfigured()) return { error: "Email isn't configured (RESEND_API_KEY)." };

  const users = await prisma.user.findMany({
    where: { role: "LEARNER", launchEmailSentAt: null, enrollments: { some: { status: "ACTIVE" } } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    const claim = await prisma.user.updateMany({
      where: { id: user.id, launchEmailSentAt: null },
      data: { launchEmailSentAt: new Date() },
    });
    if (claim.count === 0) continue;
    if (await sendCoursesOpenEmail(user)) {
      sent++;
    } else {
      failed++;
      await prisma.user.update({ where: { id: user.id }, data: { launchEmailSentAt: null } });
    }
    await pause();
  }

  revalidatePath("/admin");
  const remaining = await countLaunchEmailsPending();
  return {
    message:
      `Sent ${sent}.` +
      (failed ? ` ${failed} failed. Click again to retry.` : "") +
      (remaining ? ` ${remaining} still to send. Click again.` : " Everyone has been told."),
  };
}
