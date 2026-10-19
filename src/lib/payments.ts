import "server-only";
import { prisma } from "./prisma";
import { verifyTransaction } from "./paystack";
import { sendEnrolledEmail } from "./emails";

/**
 * Verify a Paystack reference and, if paid in full, activate its enrolment.
 * Idempotent — the callback page and the webhook may both call it.
 */
export async function reconcilePayment(reference: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return null;
  if (payment.status === "SUCCESS") return { status: "SUCCESS" as const, enrollmentId: payment.enrollmentId };

  const result = await verifyTransaction(reference);
  // Paystack reports the amount actually charged; reject anything short.
  const paidEnough = result.amountKobo === undefined || result.amountKobo >= payment.amount;

  if (!result.success || !paidEnough) {
    await prisma.payment.updateMany({
      where: { reference, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return { status: "FAILED" as const, enrollmentId: payment.enrollmentId };
  }

  // Only the request that flips PENDING → SUCCESS activates the enrolment.
  const claimed = await prisma.payment.updateMany({
    where: { reference, status: { not: "SUCCESS" } },
    data: { status: "SUCCESS", channel: result.channel ?? null, paidAt: result.paidAt ?? new Date() },
  });
  if (claimed.count === 1) {
    await prisma.enrollment.update({
      where: { id: payment.enrollmentId },
      data: { status: "ACTIVE", activatedAt: new Date() },
    });
    await notifyEnrolled(payment.enrollmentId);
  }
  return { status: "SUCCESS" as const, enrollmentId: payment.enrollmentId };
}

/** Send the enrolment email at most once (claim the timestamp, release on failure). */
async function notifyEnrolled(enrollmentId: string) {
  const claim = await prisma.enrollment.updateMany({
    where: { id: enrollmentId, enrolledEmailSentAt: null },
    data: { enrolledEmailSentAt: new Date() },
  });
  if (claim.count === 0) return;

  const e = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { user: true, tier: { include: { program: true } } },
  });
  if (!e) return;
  const sent = await sendEnrolledEmail(e.user, {
    programTitle: e.tier.program.title,
    tierName: e.tier.name,
    amountKobo: e.amount,
  });
  if (!sent) {
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { enrolledEmailSentAt: null } });
  }
}
